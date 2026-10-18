package no.kristo.finanshub.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import java.time.LocalDate

/* ================= Innstillinger i Papir (design: Mobil Papir App → side «innst») ================= */

/** Undersidene i Innstillinger (vm.settingsPage) med tittel i fotovinduet. */
internal val PAPER_SET_TITLES = mapOf(
    "accounts" to "Kontoer og brukere", "security" to "Sikkerhet", "tokens" to "API-tokens", "ai" to "AI og tolkning",
    "cats" to "Kategorier og budsjett", "rules" to "Regler", "stocks" to "Aksjer · Trading 212", "fin" to "Fanelinje og Mer i Finans",
    "modules" to "Moduler", "look" to "Utseende og fanelinje", "notify" to "Varsler og haptikk", "haptics" to "Haptikk",
    "scan" to "Skanning", "server" to "Server og synk", "data" to "Data og lagring", "backup" to "Backup og data", "about" to "Om appen", "healthpos" to "Helse og posisjon", "integ" to "Integrasjoner",
)

/**
 * Innstillinger: profilkort øverst, og gruppene KONTO, FINANS, <APPNAVN>, APP og Logg ut, med versjon nederst.
 * Hver rad har ikon i farget rute (fargetemaet), tittel, undertekst, verdi og ›. Undersidene bruker samme radstil,
 * med «‹ Alle innstillinger» i fotovinduet. Alt er Papir; ingen klassiske skjermer vises her.
 */
@Composable
internal fun PaperSettings17(vm: AppViewModel, navBottom: Dp, onPrivacyChanged: () -> Unit) {
    val sub = vm.settingsPage
    LaunchedEffect(sub) {
        when (sub) { "tokens" -> vm.loadTokens(); "notify" -> vm.loadNotify(); null -> vm.loadAppInfo() }
    }
    // Utseende: tema, ikonfarger, bakgrunn og fanelinje (egen liste fra prompt 16).
    if (sub == "look") { PaperSettings16(vm, navBottom); return }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, PAPER_BAR + 30.dp + navBottom), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        when (sub) {
            null -> settingsMain(vm)
            "fin" -> item { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) { PaperNavSettings(vm) } }
            "modules" -> item { ModulesSub(vm) }
            "notify" -> item { NotifySub(vm) }
            "accounts" -> item { AccountsPage(vm) }
            "security" -> item { SecurityPage(vm, onPrivacyChanged) }
            "tokens" -> item { TokensPage(vm) }
            "ai" -> { item { AiPage(vm) }; item { AiTimeouts23(vm) } }
            "integ" -> item { IntegrationsPage23(vm) }
            "cats" -> item { CategoriesPage(vm) }
            "rules" -> item { RulesPage(vm) }
            "stocks" -> item { StocksPrefsPage(vm) }
            "haptics" -> item { HapticsPage(vm) }
            "scan" -> item { ScanPage(vm) }
            "server" -> item { ServerPage(vm) }
            "data" -> item { DataPage(vm) }
            "backup" -> item { BackupPage(vm) }
            "about" -> item { AboutPage(vm) }
            "healthpos" -> item { HealthPosPage(vm) }
            else -> settingsMain(vm)
        }
    }
    if (vm.appNameEdit) AppNameSheet(vm)
    if (vm.appIconEdit) AppIconSheet(vm)
}

private fun androidx.compose.foundation.lazy.LazyListScope.settingsMain(vm: AppViewModel) {
    item {
        val p = PaperPal.current
        PCard(shadow = true) {
            Row(Modifier.fillMaxWidth().clickable { vm.settingsPage = "accounts" }.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                AvatarImage(vm, 56, p.surf2, p.ink)
                Column(Modifier.weight(1f)) {
                    PSerif(vm.displayName.ifBlank { "Profil" }, 22.sp, maxLines = 1)
                    Text("@${vm.account?.username?.ifBlank { null } ?: "konto"} · ${roleName(vm.me?.role ?: vm.account?.role)}", color = p.mut, fontSize = 13.sp, maxLines = 1)
                    Text(vm.base.substringAfter("://").ifBlank { vm.account?.server?.substringAfter("://") ?: "" }, color = p.mut, fontSize = 12.sp, maxLines = 1, fontFamily = PaperFonts.mono)
                }
                Text("›", color = p.mut, fontSize = 18.sp)
            }
        }
    }
    group("Konto") { i ->
        SetRow(vm, i(), Icons.Filled.People, "Kontoer og brukere", "Bytt konto, legg til og logg ut") { vm.settingsPage = "accounts" }
        SetRow(vm, i(), Icons.Filled.Lock, "Sikkerhet", if (vm.me?.totp == true) "2FA på" else "2FA av", top = true) { vm.settingsPage = "security" }
        SetRow(vm, i(), Icons.Filled.Key, "API-tokens", vm.tokens?.let { "${it.size} aktive" } ?: "Snarveier og integrasjoner", top = true) { vm.settingsPage = "tokens" }
    }
    group("Finans") { i ->
        SetRow(vm, i(), Icons.Filled.AutoAwesome, "AI og tolkning", "Gemini · Groq · Roboflow · Ollama") { vm.settingsPage = "ai" }
        SetRow(vm, i(), Icons.Filled.Category, "Kategorier og budsjett", "Farger og typer", top = true) { vm.settingsPage = "cats" }
        SetRow(vm, i(), Icons.Filled.Tune, "Regler", "Automatisk kategorisering", top = true) { vm.settingsPage = "rules" }
        SetRow(vm, i(), Icons.Filled.AccountBalance, "Bankimport", "DNB · CSV · ✦ AI", top = true) { vm.openFromMer(Screen.Import) }
        SetRow(vm, i(), Icons.AutoMirrored.Filled.ShowChart, "Aksjer · Trading 212", "Nøkkel, miljø og synk", top = true) { vm.settingsPage = "stocks" }
        SetRow(vm, i(), Icons.Filled.ViewWeek, "Fanelinje og Mer i Finans", "${vm.paperFinTabs.size} faner", top = true) { vm.settingsPage = "fin" }
        SetRow(vm, i(), Icons.Filled.Autorenew, "Subscription OS", "Abonnementer og AI-sparing", top = true) { vm.openFromMer(Screen.Sub) }
    }
    group(vm.appName) { i ->
        SetRow(vm, i(), Icons.Filled.Edit, "Navn på appen", vm.appName, "Endre ›") { vm.appNameEdit = true }
        SetRow(vm, i(), Icons.Filled.Image, "App-ikon", APP_ICONS.firstOrNull { it.first == vm.appInfo.icon }?.second ?: "Huset med stativ", "Endre ›", top = true) { vm.appIconEdit = true }
        SetRow(vm, i(), Icons.Filled.ViewWeek, "Fanelinje i Hjem", "Fjern, flytt, gi nytt navn og ikon · eller hold inne på fanelinjen", top = true) { vm.tabEdit = true }
        SetRow(vm, i(), Icons.Filled.Dashboard, "Moduler", "Familie, Huskeliste, Avganger, Vær", top = true) { vm.settingsPage = "modules" }
        SetRow(vm, i(), Icons.Filled.Newspaper, "Nyhetsleser", "Kilder og AI", top = true) { vm.openNews(settings = true) }
    }
    group("App") { i ->
        SetRow(vm, i(), Icons.Filled.Palette, "Utseende og fanelinje", "Papir ${when (vm.paperMode) { "mork" -> "mørk"; "lys" -> "lys"; else -> "· følger systemet" }} · bakgrunn · ikonfarger") { vm.settingsPage = "look" }
        SetRow(vm, i(), Icons.Filled.Notifications, "Varsler og haptikk", "Lyd, stille timer og test", top = true) { vm.settingsPage = "notify" }
        SetRow(vm, i(), Icons.Filled.Home, "Integrasjoner", "Home Assistant", top = true) { vm.settingsPage = "integ" }
        SetRow(vm, i(), Icons.Filled.MonitorHeart, "Helse og posisjon", "Health Connect, typer og posisjonsdeling", top = true) { vm.settingsPage = "healthpos" }
        SetRow(vm, i(), Icons.Filled.DocumentScanner, "Skanning", "Kamera, beskjæring og opplasting", top = true) { vm.settingsPage = "scan" }
        SetRow(vm, i(), Icons.Filled.Dns, "Server og synk", "Lokal og ekstern adresse", top = true) { vm.settingsPage = "server" }
        SetRow(vm, i(), Icons.Filled.Backup, "Backup og data", "Nedlasting og lagring", top = true) { vm.settingsPage = "backup" }
    }
    item { Spacer(Modifier.height(4.dp)) }
    item {
        PCard {
            SetRow(vm, 0, Icons.AutoMirrored.Filled.Logout, "Logg ut", null, "") { vm.logout() }
        }
    }
    item {
        val ctx = LocalContext.current
        val version = remember { runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "–" }
        Text("${vm.appName} · versjon $version", color = PaperPal.current.mut, fontSize = 11.5.sp, fontFamily = PaperFonts.mono,
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

private fun roleName(r: String?) = when (r) { "admin" -> "Admin"; "bruker", "user" -> "Bruker"; null, "" -> ""; else -> r.replaceFirstChar { it.uppercase() } }

/** Gruppe med Plex Mono-etikett og hvitt kort. i() gir neste fargeindeks, så ikonfargene varierer. */
private fun androidx.compose.foundation.lazy.LazyListScope.group(title: String, rows: @Composable ColumnScope.(() -> Int) -> Unit) {
    item { PLabel(title, modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
    item {
        var n = 0
        PCard { rows { n++ } }
    }
}

/** Moduler: hva som finnes i appen og hvor de åpnes. */
@Composable
private fun ModulesSub(vm: AppViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Moduler", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        PCard {
            SetRow(vm, 0, Icons.Filled.MyLocation, "Familie og kart", "Posisjon, soner og helse") { vm.openFamily() }
            SetRow(vm, 1, Icons.Filled.Checklist, "Huskeliste", "Oppgaver for hele familien", top = true) { vm.openTasks() }
            SetRow(vm, 2, Icons.Filled.DirectionsBus, "Avganger", "Holdeplasser og sanntid fra Ruter", top = true) { vm.openRuter() }
            SetRow(vm, 3, Icons.Filled.WbSunny, "Vær", "Steder, varsel og Yr mot Storm", top = true) { vm.openWeather() }
            SetRow(vm, 4, Icons.Filled.Newspaper, "Nyhetsleser", "RSS med ✦ AI-sammendrag", top = true) { vm.openNews() }
            SetRow(vm, 5, Icons.Filled.LocalShipping, "Sporing", "Pakker fra e-post og Finn", top = true) { vm.openFromMer(Screen.Tracking) }
            SetRow(vm, 0, Icons.Filled.Language, "Domener", "Cloudflare-statistikk", top = true) { vm.openFromMer(Screen.Domains) }
            SetRow(vm, 1, Icons.Filled.Restaurant, "Mat", "Ukeplan og oppskrifter", top = true) { vm.paperTab("mat") }
        }
    }
}

/* ---------------- Varsler (Innstillinger → Varsler) ---------------- */

/** Hovedbryter, stille timer, tillatelse og «Test varsel», varsellyd (fem innebygde, egen lyd, stille) med volum, og gruppene. */
@Composable
private fun NotifySub(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val n = vm.notifyPrefs
    val perm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) vm.testNotify() }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(vm::uploadSound) }
    val allowed = Notify.allowed(ctx)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Varsler", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        PCard {
            PToggle("Varsler", "Hovedbryter for alle varsler fra appen", n.on) { vm.saveNotify(n.copy(on = it)) }
            PToggle("Stille timer", "${n.quietFrom}–${n.quietTo}: varsler kommer uten lyd", n.quiet, top = true) { vm.saveNotify(n.copy(quiet = it)) }
            if (n.quiet) Row(Modifier.fillMaxWidth().padding(14.dp, 4.dp, 14.dp, 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TimeChips("Fra", n.quietFrom, listOf("21:00", "22:00", "23:00")) { vm.saveNotify(n.copy(quietFrom = it)) }
                TimeChips("Til", n.quietTo, listOf("06:00", "07:00", "08:00")) { vm.saveNotify(n.copy(quietTo = it)) }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Row(Modifier.fillMaxWidth().padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) {
                    Text("Tillatelse på telefonen", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                    Text(if (allowed) "Tillatt" else "Ikke tillatt ennå", color = if (allowed) p.pos else p.lab, fontSize = 12.5.sp)
                }
                PButton("Test varsel", height = 38.dp) {
                    if (!allowed && android.os.Build.VERSION.SDK_INT >= 33) perm.launch(android.Manifest.permission.POST_NOTIFICATIONS) else vm.testNotify()
                }
            }
        }
        PLabel("Varsellyd", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            NOTIFY_SOUNDS.forEachIndexed { i, (k, name) ->
                val on = n.sound == k
                Column {
                    if (i > 0) Box(Modifier.fillMaxWidth().padding(start = 14.dp).height(1.dp).background(p.line))
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            if (k == "egen" && !n.customSound) pick.launch(arrayOf("audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/*"))
                            else { vm.saveNotify(n.copy(sound = k)); Notify.preview(ctx, k, n.volume) }
                        }.padding(14.dp, 11.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(if (k == "stille") "∅" else "♪", color = if (on) p.lab else p.mut, fontSize = 16.sp)
                        Column(Modifier.weight(1f)) {
                            Text(name, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                            if (k == "egen") Text(if (n.customSound) "Lastet opp · trykk «Bytt» for ny" else "Last opp MP3, WAV eller M4A under 1 MB", color = p.mut, fontSize = 12.sp)
                        }
                        if (k == "egen" && n.customSound) Text("Bytt", color = p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clip(CircleShape).clickable { pick.launch(arrayOf("audio/*")) }.padding(8.dp, 4.dp))
                        if (on) Text("✓", color = p.ink, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
            Column(Modifier.padding(14.dp, 10.dp)) {
                Text("Volum ${n.volume} %", color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                var vol by remember(n.volume) { mutableStateOf(n.volume.toFloat()) }
                Slider(vol, { vol = it }, valueRange = 0f..100f, onValueChangeFinished = { vm.saveNotify(n.copy(volume = Math.round(vol))) },
                    colors = SliderDefaults.colors(thumbColor = p.ink, activeTrackColor = p.ink, inactiveTrackColor = p.line))
                Text("Innebygde lyder følger varselvolumet på telefonen. Egen lyd spilles med volumet her.", color = p.mut, fontSize = 11.5.sp)
            }
            if (n.customSound) {
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                PRow("Fjern egen lyd", null, "Fjern", p.lab, serif = false) { vm.deleteSound() }
            }
        }
        PLabel("Grupper", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            NOTIFY_GROUPS.forEachIndexed { i, (k, name) ->
                val sub = when (k) {
                    "pakker" -> "Ny pakke, klar for henting, ute for levering, forsinket og levert"
                    "finans" -> "Kvitteringer til gjennomgang, budsjett og faste trekk"
                    "familie" -> "Når noen kommer til eller forlater en sone"
                    "reise" -> "Avganger, vær og nyheter"
                    else -> "Vibrasjon ved trykk, skann og varsler"
                }
                PToggle(name, sub, n.groups[k] ?: true, top = i > 0) { v ->
                    vm.saveNotify(n.copy(groups = n.groups + (k to v)))
                    if (k == "haptikk") vm.setPref(Haptics.ON, v)
                }
            }
        }
        PLabel("Pakkevarsler", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        vm.tracking?.let { t ->
            PCard {
                listOf(
                    Triple("found", "Ny pakke funnet", "Når et sporingsnummer dukker opp i e-post eller Finn"),
                    Triple("pickup", "Klar for henting", "Med hentested og frist"),
                    Triple("out", "Ute for levering", "Når budet er på vei til deg"),
                    Triple("delayed", "Forsinket", "Når leveringen er forsinket"),
                    Triple("delivered", "Levert", "Når pakken er levert"),
                ).forEachIndexed { i, (k, name, sub) -> PToggle(name, sub, t.prefs[k] ?: true, top = i > 0) { vm.setTrackingPref(k, it) } }
            }
        } ?: Text("Pakkevarslene vises når Sporing er lastet.", color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(4.dp))
        PCard { SetRow(vm, 2, Icons.Filled.Vibration, "Haptikk", "Styrke og typer", "›") { vm.settingsPage = "haptics" } }
    }
}

@Composable
private fun TimeChips(label: String, cur: String, opts: List<String>, onPick: (String) -> Unit) {
    val p = PaperPal.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = p.mut, fontSize = 12.sp)
        opts.forEach { o -> PChip(o, o == cur) { onPick(o) } }
    }
}

/* ---------------- Navn på appen og App-ikon ---------------- */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppNameSheet(vm: AppViewModel) {
    val p = PaperPal.current
    var name by remember { mutableStateOf(vm.appName) }
    ModalBottomSheet(onDismissRequest = { vm.appNameEdit = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().imePadding().padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PSerif("Navn på appen", 24.sp)
            Text("Vises på Hjem, i innloggingen, i varsler og i nettleserfanen på web.", color = p.mut, fontSize = 13.sp)
            PField("Navn", name, { name = it.take(40) }, placeholder = "Homelab", onDone = { vm.saveAppName(name); vm.appNameEdit = false })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Homelab", "Torskenes Verden").forEach { s -> PChip(s, name == s) { name = s } }
            }
            PButton("Lagre", Modifier.fillMaxWidth(), height = 50.dp) { vm.saveAppName(name); vm.appNameEdit = false }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppIconSheet(vm: AppViewModel) {
    val p = PaperPal.current
    ModalBottomSheet(onDismissRequest = { vm.appIconEdit = false }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PSerif("App-ikon", 24.sp)
            Text("Tre ikoner. Alle har eget monokromt lag, så «Tematiske ikoner» i Material You farger dem som resten av hjemskjermen.", color = p.mut, fontSize = 13.sp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                APP_ICONS.forEach { (k, name, _) ->
                    val on = vm.appInfo.icon == k
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).border(if (on) 2.dp else 1.dp, if (on) p.ink else p.line, RoundedCornerShape(18.dp))
                            .clickable { vm.setAppIcon(k) }.padding(10.dp),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        AppIconPreview(k, vm.appName, Modifier.size(64.dp))
                        Text(name, color = p.ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        if (on) Text("✓ I bruk", color = p.pos, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}

/** Forhåndsvisning av app-ikonene (samme former som de adaptive ikonene i res/drawable). */
@Composable
internal fun AppIconPreview(key: String, appName: String, modifier: Modifier) {
    Canvas(modifier.clip(RoundedCornerShape(16.dp))) {
        val u = size.minDimension / 1024f
        fun rr(x: Float, y: Float, w: Float, h: Float, r: Float, c: Color) =
            drawRoundRect(c, Offset(x * u, y * u), androidx.compose.ui.geometry.Size(w * u, h * u), androidx.compose.ui.geometry.CornerRadius(r * u, r * u))
        val paper = Color(0xFFF3EFE6); val ink = Color(0xFF1B1A17); val red = Color(0xFFB23A2A)
        when (key) {
            "monogram" -> {
                drawRect(red)
                val fold = Path().apply { moveTo(1024 * u, 760 * u); lineTo(760 * u, 1024 * u); lineTo(1024 * u, 1024 * u); close() }
                drawPath(fold, Color(0xFF8E2B1E))
                // Forbokstaven i appnavnet som enkel serif-blokk (H, T …): stolper og tverrligger.
                val ch = appName.firstOrNull()?.uppercaseChar() ?: 'H'
                if (ch == 'T') { rr(300f, 270f, 424f, 70f, 6f, paper); rr(472f, 270f, 80f, 420f, 6f, paper) }
                else { rr(318f, 270f, 90f, 420f, 6f, paper); rr(616f, 270f, 90f, 420f, 6f, paper); rr(318f, 450f, 388f, 60f, 6f, paper) }
                drawCircle(paper, 34 * u, Offset(742 * u, 350 * u))
            }
            "rom" -> {
                drawRect(ink)
                val house = Path().apply { moveTo(512 * u, 196 * u); lineTo(820 * u, 452 * u); lineTo(820 * u, 828 * u); lineTo(204 * u, 828 * u); lineTo(204 * u, 452 * u); close() }
                drawPath(house, paper)
                rr(276f, 500f, 216f, 140f, 18f, red); rr(532f, 500f, 216f, 140f, 18f, ink); rr(276f, 672f, 216f, 104f, 18f, ink); rr(532f, 672f, 216f, 104f, 18f, ink)
            }
            else -> {
                drawRect(paper)
                val roof = Path().apply { moveTo(232 * u, 470 * u); lineTo(512 * u, 236 * u); lineTo(792 * u, 470 * u) }
                drawPath(roof, ink, style = Stroke(56 * u, cap = StrokeCap.Round))
                rr(312f, 480f, 400f, 300f, 28f, ink)
                listOf(526f, 604f, 682f).forEachIndexed { i, y ->
                    rr(352f, y, 320f, 56f, 12f, paper)
                    drawCircle(if (i == 0) red else ink, 14 * u, Offset(628 * u, (y + 28) * u))
                }
            }
        }
    }
}

/* ================= Huskeliste (ny fane) ================= */

/**
 * Huskeliste: listene Alle, Hjem, Handel, Hytta og Jobb. Oppgaver med navn, liste, forfall (I dag, I morgen, Neste uke
 * eller uten dato) og hvem som skal gjøre den, gruppert i «I dag og forfalt», «Senere» og «Ferdig». Delt i familien.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TasksScreen(vm: AppViewModel) {
    val p = PaperPal.current
    BackHandler { if (vm.taskEditId != null) vm.taskEditId = null else vm.closeTasks() }
    val t = vm.tasks
    val lists = t?.lists?.ifEmpty { null } ?: TASK_LISTS_DEFAULT
    val members = t?.members ?: emptyList()
    val today = LocalDate.now().toString()
    val all = (t?.items ?: emptyList()).filter { vm.taskFilter == "alle" || it.list == vm.taskFilter }
    val now = all.filter { !it.done && it.due != null && it.due <= today }
    val later = all.filter { !it.done && (it.due == null || it.due > today) }.sortedBy { it.due ?: "9999" }
    val done = all.filter { it.done }
    var title by remember { mutableStateOf("") }
    var due by remember { mutableStateOf<String?>(today) }
    var who by remember { mutableStateOf<String?>(null) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(vm.taskFocus) { if (vm.taskFocus) { delay(300); runCatching { focus.requestFocus() }; vm.taskFocus = false } }
    val add = {
        if (title.isNotBlank()) {
            vm.addTask(title, vm.taskFilter.takeIf { it != "alle" } ?: lists.first().id, due, who)
            title = ""
        }
    }
    Box(Modifier.fillMaxSize().background(p.bg)) {
        LaunchedEffect(Unit) { vm.loadTasksHa() }
        LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(0.dp, 0.dp, 0.dp, 120.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { ModuleHero("Dine lister og lister delt med deg", "Huskeliste", "‹ Hjem") { vm.closeTasks() } }
            item {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TaskListChip("Alle", null, vm.taskFilter == "alle", (t?.items ?: emptyList()).count { !it.done }) { vm.taskFilter = "alle" }
                    lists.forEach { l -> TaskListChip(l.name, l.color, vm.taskFilter == l.id, (t?.items ?: emptyList()).count { !it.done && it.list == l.id }) { vm.taskFilter = l.id } }
                }
            }
            // Prompt 21: eier og «Delt med …» for valgt liste, med «Del liste» (bare eieren kan dele).
            lists.firstOrNull { it.id == vm.taskFilter }?.let { cur -> item { ListShareRow(vm, cur, members) } }
            // Frist og person for nye oppgaver (prompt 22: fylte chips når valgt). Feltet ligger fast nederst, over fanelinjen.
            item {
                FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    dueOptions(today).forEach { (k, n) -> TaskChip(n, due == k) { due = k } }
                    if (members.isNotEmpty()) {
                        TaskChip("Alle", who == null) { who = null }
                        members.forEach { m -> TaskChip(m.name.split(' ').first(), who == m.id) { who = m.id } }
                    }
                }
            }
            vm.tasksError?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 18.dp)) } }
            if (t == null && vm.tasksError == null) item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
            taskGroup(vm, "I dag og forfalt", now, lists, members, today)
            taskGroup(vm, "Senere", later, lists, members, today)
            taskGroup(vm, "Ferdig", done.take(30), lists, members, today)
            if (t != null && all.isEmpty()) item { Text("Ingen oppgaver her ennå.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 18.dp)) }
            // Prompt 22: synk med Home Assistant To-do (bare admin).
            if (vm.userIsAdmin && vm.tasksHa != null) item { TasksHaSection(vm, lists) }
        }
        TaskDock(title, { title = it }, focus, Modifier.align(Alignment.BottomCenter)) { if (title.isBlank()) runCatching { focus.requestFocus() } else add() }
    }
    vm.taskEditId?.let { id -> (t?.items ?: emptyList()).firstOrNull { it.id == id }?.let { TaskSheet(vm, it, lists, members, today) } }
    vm.shareListId?.let { id -> lists.firstOrNull { it.id == id }?.let { ShareListSheet(vm, it) } }
}

private fun firstName(n: String) = n.split(' ').first()

/** «Eier: Du · Delt med Ingrid og Pål» med knappen «Del liste» for eieren. */
@Composable
private fun ListShareRow(vm: AppViewModel, l: TaskList, members: List<TaskMember>) {
    val p = PaperPal.current
    fun nameOf(m: TaskMember) = m.name.ifBlank { members.firstOrNull { it.id == m.id }?.name ?: "" }.ifBlank { "en person" }
    val owner = if (l.mine) "Du" else l.ownerName ?: members.firstOrNull { it.id == l.owner }?.name?.let(::firstName) ?: "en annen"
    val shared = l.members.filter { it.id != l.owner }.map { firstName(nameOf(it)) }
    val sharedText = when (shared.size) { 0 -> "Ikke delt"; 1 -> "Delt med ${shared[0]}"; else -> "Delt med " + shared.dropLast(1).joinToString(", ") + " og " + shared.last() }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(16.dp)).background(p.card).padding(start = 14.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(Color(l.color)))
        Column(Modifier.weight(1f)) {
            Text("Eier: $owner", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, maxLines = 1)
            Text(sharedText, color = if (shared.isEmpty()) p.mut else p.pos, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (l.mine) Box(Modifier.height(36.dp).clip(CircleShape).background(p.ink).clickable { Haptics.select(); vm.openShareList(l.id) }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
            Text("Del liste", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
    }
}

/** «Del liste»: velg personene listen skal deles med. Medlemmer kan legge til, endre og fullføre oppgaver. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShareListSheet(vm: AppViewModel, l: TaskList) {
    val p = PaperPal.current
    var picked by remember(l.id) { mutableStateOf(l.members.map { it.id }.filter { it != l.owner }.toSet()) }
    ModalBottomSheet(onDismissRequest = { vm.shareListId = null }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            PSerif("Del «${l.name}»", 24.sp)
            Text("De du velger, ser listen og kan legge til, endre og fullføre oppgaver. Bare du kan dele eller slette den.", color = p.mut, fontSize = 13.sp)
            val users = vm.taskUsers
            if (users.isEmpty()) Text("Henter personer …", color = p.mut, fontSize = 13.sp)
            else PCard {
                users.forEachIndexed { i, u ->
                    PToggle(u.name.ifBlank { "Uten navn" }, null, u.id in picked, top = i > 0) { on -> picked = if (on) picked + u.id else picked - u.id }
                }
            }
            PButton(if (vm.shareBusy) "Lagrer …" else "Lagre deling", Modifier.fillMaxWidth()) { if (!vm.shareBusy) vm.shareList(l.id, picked.toList()) }
        }
    }
}

private fun dueOptions(today: String): List<Pair<String?, String>> {
    val d = LocalDate.parse(today)
    return listOf(today to "I dag", d.plusDays(1).toString() to "I morgen", d.plusWeeks(1).toString() to "Neste uke", null to "Uten dato")
}

private fun androidx.compose.foundation.lazy.LazyListScope.taskGroup(vm: AppViewModel, title: String, items: List<TaskItem>, lists: List<TaskList>, members: List<TaskMember>, today: String) {
    if (items.isEmpty()) return
    item { PLabel("$title · ${items.size}", modifier = Modifier.padding(start = 20.dp, top = 6.dp)) }
    item {
        PCard(Modifier.padding(horizontal = 16.dp)) {
            items.forEachIndexed { i, it -> TaskRow(vm, it, lists, members, today, top = i > 0) }
        }
    }
}

@Composable
private fun TaskRow(vm: AppViewModel, t: TaskItem, lists: List<TaskList>, members: List<TaskMember>, today: String, top: Boolean) {
    val p = PaperPal.current
    val l = lists.firstOrNull { it.id == t.list }
    val who = members.firstOrNull { it.id == t.assignee }?.name?.split(' ')?.first()
    Column {
        if (top) Box(Modifier.fillMaxWidth().padding(start = 52.dp).height(1.dp).background(p.line))
        Row(Modifier.fillMaxWidth().clickable { vm.taskEditId = t.id }.padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                Modifier.size(24.dp).clip(CircleShape).background(if (t.done) p.pos else Color.Transparent).border(2.dp, if (t.done) p.pos else p.mut, CircleShape)
                    .clickable { vm.toggleTask(t.id) },
                contentAlignment = Alignment.Center,
            ) { if (t.done) Text("✓", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold) }
            Column(Modifier.weight(1f)) {
                Text(t.title, color = if (t.done) p.mut else p.ink, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    textDecoration = if (t.done) TextDecoration.LineThrough else null)
                val meta = listOfNotNull(l?.name, dueText(t.due, today), who).joinToString(" · ")
                if (meta.isNotBlank()) Text(meta, color = if (!t.done && t.due != null && t.due < today) p.lab else p.mut, fontSize = 12.sp, maxLines = 1)
            }
            if (l != null) Box(Modifier.size(8.dp).clip(CircleShape).background(Color(l.color)))
        }
    }
}

private fun dueText(due: String?, today: String): String? {
    if (due == null) return null
    val d = runCatching { LocalDate.parse(due) }.getOrNull() ?: return due
    val t = LocalDate.parse(today)
    return when {
        d.isBefore(t) -> "Forfalt ${d.dayOfMonth}.${d.monthValue}."
        d == t -> "I dag"
        d == t.plusDays(1) -> "I morgen"
        d.isBefore(t.plusDays(7)) -> d.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, NB16).replaceFirstChar { it.uppercase() }
        else -> "${d.dayOfMonth}.${d.monthValue}."
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun TaskSheet(vm: AppViewModel, t: TaskItem, lists: List<TaskList>, members: List<TaskMember>, today: String) {
    val p = PaperPal.current
    var title by remember(t.id) { mutableStateOf(t.title) }
    var list by remember(t.id) { mutableStateOf(t.list) }
    var due by remember(t.id) { mutableStateOf(t.due) }
    var who by remember(t.id) { mutableStateOf(t.assignee) }
    var sure by remember(t.id) { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = { vm.taskEditId = null }, containerColor = p.bg, contentColor = p.ink) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(18.dp, 0.dp, 18.dp, 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PSerif("Oppgave", 24.sp)
            PField("Navn", title, { title = it })
            PLabel("Liste")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { lists.forEach { l -> PChip(l.name, list == l.id) { list = l.id } } }
            PLabel("Forfall")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { dueOptions(today).forEach { (k, n) -> PChip(n, due == k) { due = k } } }
            if (members.isNotEmpty()) {
                PLabel("Hvem")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PChip("Alle", who == null) { who = null }
                    members.forEach { m -> PChip(m.name.split(' ').first(), who == m.id) { who = m.id } }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PButton(if (sure) "Trykk igjen for å slette" else "Slett", Modifier.weight(1f), kind = "line") {
                    if (sure) { vm.deleteTask(t.id); vm.taskEditId = null } else sure = true
                }
                PButton("Lagre", Modifier.weight(1f)) { vm.updateTask(t.id, title, list, due, who); vm.taskEditId = null }
            }
        }
    }
}

/** Toppbilde for egne sider (Huskeliste, Yr mot Storm): mørk gradient med kicker, tittel og tilbake-pille. */
@Composable
internal fun ModuleHero(kicker: String, title: String, back: String, onBack: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xFF4A5A6A), Color(0xFF2A3440), Color(0xFF1D242C))))
            .statusBarsPadding().padding(18.dp, 10.dp, 18.dp, 22.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(Modifier.height(34.dp).clip(CircleShape).background(Color(0x8C1B1A17)).clickable(onClick = onBack).padding(start = 10.dp, end = 14.dp), contentAlignment = Alignment.Center) {
                Text(back, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            }
            Column {
                PSerif(kicker, 15.sp, Color.White.copy(alpha = .9f), italic = true, weight = FontWeight.Normal, maxLines = 1)
                PSerif(title, 34.sp, Color.White, maxLines = 1)
            }
        }
    }
}

/* ================= Vær: Yr mot Storm ================= */

/** Neste 24 timer (temperatur som to linjer, nedbør som søyler) og 7 dager med avvik i makstemperatur og hvor enige de er. */
@Composable
internal fun CompareScreen(vm: AppViewModel) {
    val p = PaperPal.current
    BackHandler { vm.compareOpen = false }
    val c = vm.wxCompare
    val yr = Color(0xFF0F7BC4)
    val st = Color(0xFFB23A2A)
    Box(Modifier.fillMaxSize().background(p.bg)) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(0.dp, 0.dp, 0.dp, 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item { ModuleHero(c?.place ?: "Vær", "Yr mot Storm", "‹ Vær") { vm.compareOpen = false } }
            vm.wxCompareError?.let { e -> item { Text(e, color = p.lab, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 18.dp)) } }
            if (c == null && vm.wxCompareError == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
            if (c != null) {
                item {
                    PCard(Modifier.padding(horizontal = 16.dp)) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                PLabel("Neste 24 timer", modifier = Modifier.weight(1f))
                                Legend("Yr", yr); Legend("Storm (ECMWF)", st)
                            }
                            CompareChart(c.hours, yr, st, Modifier.fillMaxWidth().height(170.dp))
                            c.agreement?.let { a -> Text("Enighet neste døgn: $a %", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
                        }
                    }
                }
                item {
                    PCard(Modifier.padding(horizontal = 16.dp)) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            PLabel("7 dager")
                            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                                Text("Dag", color = p.mut, fontSize = 11.5.sp, modifier = Modifier.weight(1.1f))
                                Text("Yr", color = yr, fontSize = 11.5.sp, modifier = Modifier.weight(1f))
                                Text("Storm", color = st, fontSize = 11.5.sp, modifier = Modifier.weight(1f))
                                Text("Avvik", color = p.mut, fontSize = 11.5.sp, modifier = Modifier.weight(.8f))
                                Text("Enige", color = p.mut, fontSize = 11.5.sp, modifier = Modifier.weight(.8f))
                            }
                            c.days.forEachIndexed { i, d ->
                                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(dayName(d.date), color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1.1f), maxLines = 1)
                                    Text("${deg(d.yrHi)}/${deg(d.yrLo)}", color = p.ink, fontSize = 13.sp, fontFamily = PaperFonts.mono, modifier = Modifier.weight(1f))
                                    Text("${deg(d.ecHi)}/${deg(d.ecLo)}", color = p.ink, fontSize = 13.sp, fontFamily = PaperFonts.mono, modifier = Modifier.weight(1f))
                                    Text(d.diffHi?.let { (if (it > 0) "+" else "") + String.format(java.util.Locale.US, "%.1f°", it) } ?: "–",
                                        color = if ((d.diffHi ?: 0.0).let { Math.abs(it) } >= 3) p.lab else p.mut, fontSize = 12.5.sp, modifier = Modifier.weight(.8f))
                                    Text(d.agree?.let { "$it %" } ?: "–", color = if ((d.agree ?: 100) < 60) p.lab else p.pos, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(.8f))
                                }
                            }
                        }
                    }
                }
                item {
                    Text("Yr: MET Norge (api.met.no). Storm har ikke et åpent API, så ECMWF fra Open-Meteo brukes som nærmeste kilde.",
                        color = p.mut, fontSize = 11.5.sp, modifier = Modifier.padding(horizontal = 18.dp))
                }
            }
        }
    }
}

private fun deg(v: Double?) = v?.let { "${Math.round(it)}°" } ?: "–"
private fun dayName(d: String) = runCatching {
    val x = LocalDate.parse(d.take(10))
    if (x == LocalDate.now()) "I dag" else x.dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, NB16).replaceFirstChar { it.uppercase() } + " ${x.dayOfMonth}."
}.getOrDefault(d)

@Composable
private fun Legend(name: String, c: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.size(10.dp, 3.dp).background(c))
        Text(name, color = PaperPal.current.mut, fontSize = 11.sp)
    }
}

/** Temperatur som to linjer og nedbør som søyler (Yr venstre halvdel av søylen, Storm høyre). */
@Composable
private fun CompareChart(h: List<CmpHour>, yr: Color, st: Color, modifier: Modifier) {
    val p = PaperPal.current
    val temps = h.flatMap { listOfNotNull(it.yrTemp, it.ecTemp) }
    val lo = (temps.minOrNull() ?: 0.0) - 1
    val hi = (temps.maxOrNull() ?: 10.0) + 1
    val mm = (h.flatMap { listOfNotNull(it.yrMm, it.ecMm) }.maxOrNull() ?: 0.0).coerceAtLeast(2.0)
    Column(modifier) {
        Canvas(Modifier.fillMaxWidth().weight(1f)) {
            if (h.size < 2) return@Canvas
            val w = size.width; val ht = size.height
            val step = w / (h.size - 1)
            fun y(t: Double) = (ht * 0.78f) - ((t - lo) / (hi - lo)).toFloat() * (ht * 0.74f)
            h.forEachIndexed { i, x ->
                val bw = step * 0.38f
                x.yrMm?.let { m -> val bh = (m / mm).toFloat() * ht * 0.2f; drawRect(yr.copy(alpha = .35f), Offset(i * step - bw, ht - bh), androidx.compose.ui.geometry.Size(bw, bh)) }
                x.ecMm?.let { m -> val bh = (m / mm).toFloat() * ht * 0.2f; drawRect(st.copy(alpha = .35f), Offset(i * step, ht - bh), androidx.compose.ui.geometry.Size(bw, bh)) }
            }
            fun line(sel: (CmpHour) -> Double?, c: Color) {
                val path = Path()
                var started = false
                h.forEachIndexed { i, x -> sel(x)?.let { t -> if (!started) { path.moveTo(i * step, y(t)); started = true } else path.lineTo(i * step, y(t)) } }
                drawPath(path, c, style = Stroke(5f, cap = StrokeCap.Round))
            }
            line({ it.yrTemp }, yr)
            line({ it.ecTemp }, st)
        }
        Row(Modifier.fillMaxWidth()) {
            listOf(0, h.size / 4, h.size / 2, 3 * h.size / 4, h.size - 1).distinct().forEach { i ->
                Text(h.getOrNull(i)?.t?.let { t -> t.substringAfter('T').take(2) } ?: "", color = p.mut, fontSize = 10.sp, modifier = Modifier.weight(1f))
            }
        }
    }
}

/* ================= Hjem: Posisjon, Bolig og Huskeliste ================= */

/**
 * Posisjon · Familie (prompt 20, kort h6): to kolonner, avatar 34×34 i personens farge med to bokstaver og statusprikk,
 * navn og linje 2 (sone, «Går · Bislett», strøk, «Sist sett 14:32» eller «Deler ikke posisjon»). «Du» først, maks 4 (siste blir +N).
 */
@Composable
internal fun HomePositionCard(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(Unit) { while (true) { vm.loadPositions(); delay(60_000) } }
    val list = vm.famPositions
    PCard(onClick = { vm.openFamily() }) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("POSISJON · FAMILIE", color = p.lab, fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold, fontFamily = PaperFonts.mono,
                    letterSpacing = 1.26.sp, modifier = Modifier.weight(1f))
                Text("kart ›", color = p.mut, fontSize = 12.sp)
            }
            if (list == null) Text("Se hvor familien er, soner og helse.", color = p.mut, fontSize = 13.sp)
            else if (list.isEmpty()) Text("Ingen i familien ennå.", color = p.mut, fontSize = 13.sp)
            else {
                val shown = if (list.size > 4) list.take(3) else list
                val cells: List<PosCard?> = shown + (if (list.size > 4) listOf(null) else emptyList())
                cells.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        row.forEach { c ->
                            Box(Modifier.weight(1f)) { if (c != null) PosCell(vm, c) else PosMore(list.size - 3) }
                        }
                        if (row.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun PosCell(vm: AppViewModel, c: PosCard) {
    val p = PaperPal.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(36.dp)) {
            ServerImage(vm, c.photo, Modifier.size(34.dp).clip(CircleShape).background(Color(c.color))) {
                Text(c.initials, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, fontFamily = PaperFonts.sans, modifier = Modifier.align(Alignment.Center))
            }
            val dot = when (c.status) { "fresh" -> Color(0xFF2F7A4F); "stale" -> Color(0xFFD9A400); else -> Color(0xFF8A8578) }
            Box(Modifier.align(Alignment.BottomEnd).size(10.dp).clip(CircleShape).background(p.card).padding(2.dp).clip(CircleShape).background(dot))
        }
        Column(Modifier.weight(1f)) {
            Text(c.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(c.line2, color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun PosMore(n: Int) {
    val p = PaperPal.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(p.surf2), contentAlignment = Alignment.Center) {
            Text("+$n", color = p.ink, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
        }
        Text("Se alle", color = p.mut, fontSize = 12.sp)
    }
}

@Composable
internal fun HomeBoligCard(vm: AppViewModel) {
    val p = PaperPal.current
    val b = vm.homeBolig
    PCard(onClick = { vm.paperTab("fin"); vm.openFromMer(Screen.Folders); b?.id?.toIntOrNull()?.let { vm.openFolder(it) } }) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row { PLabel("Bolig", modifier = Modifier.weight(1f)); Text((b?.name ?: "Boliger") + " ›", color = p.mut, fontSize = 12.sp, maxLines = 1) }
            if (b == null) Text("Utgifter, regninger og kvitteringer for boligen.", color = p.mut, fontSize = 13.sp)
            else {
                Row(verticalAlignment = Alignment.Bottom) {
                    PSerif("${n0(b.spent)} kr", 26.sp, maxLines = 1, modifier = Modifier.weight(1f))
                    Text(b.budget?.let { "av ${n0(it)} kr" } ?: "brukt denne måneden", color = p.mut, fontSize = 12.sp)
                }
                b.budget?.takeIf { it > 0 }?.let { bud ->
                    Box(Modifier.fillMaxWidth().height(5.dp).clip(CircleShape).background(p.line)) {
                        Box(Modifier.fillMaxHeight().fillMaxWidth((b.spent / bud).toFloat().coerceIn(0.02f, 1f)).clip(CircleShape).background(if (b.spent > bud) p.lab else p.ink))
                    }
                }
                if (b.review > 0) Text("${b.review} til gjennomgang", color = p.lab, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                b.nextTitle?.let { t -> Text("Neste: $t${b.nextAmount?.let { " · ${n0(it)} kr" } ?: ""}${b.nextDate?.let { " · " + dueText(it.take(10), LocalDate.now().toString()) } ?: ""}", color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
        }
    }
}

@Composable
internal fun HomeTasksCard(vm: AppViewModel) {
    val p = PaperPal.current
    val next = vm.taskNext
    PCard(onClick = { vm.openTasks() }) {
        Column(Modifier.padding(14.dp, 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PLabel("Huskeliste", modifier = Modifier.weight(1f))
                Text("+ Ny", color = p.lab, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clip(CircleShape).clickable { vm.openTasks(newTask = true) }.padding(8.dp, 4.dp))
            }
            if (next.isEmpty()) Text("Ingen oppgaver. Trykk + Ny for å legge til.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(vertical = 6.dp))
            next.forEach { t ->
                Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(20.dp).clip(CircleShape).border(2.dp, p.mut, CircleShape).clickable { vm.toggleTask(t.id) })
                    Text(t.title, color = p.ink, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    dueText(t.due, LocalDate.now().toString())?.let { Text(it, color = if (t.due!! < LocalDate.now().toString()) p.lab else p.mut, fontSize = 11.5.sp) }
                }
            }
        }
    }
}

/* ================= Sporing: velg flere ================= */

/** Linja når pakker er valgt: Velg alle, Arkiver (Gjenopprett i Arkiv) og Slett (må bekreftes med et ekstra trykk). */
@Composable
internal fun TrkPickBar(vm: AppViewModel, ids: List<String>, archive: Boolean) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.ink).padding(12.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${vm.trkPicked.size} valgt", color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Text("Ferdig", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clip(CircleShape).clickable { vm.trkPickDone() }.padding(10.dp, 4.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BarBtn(if (vm.trkPicked.containsAll(ids) && ids.isNotEmpty()) "Velg ingen" else "Velg alle", Modifier.weight(1f)) { vm.trkPickAll(ids) }
            BarBtn(if (archive) "Gjenopprett" else "Arkiver", Modifier.weight(1f)) { vm.trkBulk(if (archive) "unarchive" else "archive") }
            BarBtn(if (vm.trkConfirmDelete) "Bekreft sletting" else "Slett", Modifier.weight(1f), danger = true) {
                if (vm.trkConfirmDelete) vm.trkBulk("delete") else vm.trkConfirmDelete = true
            }
        }
    }
}

@Composable
private fun BarBtn(text: String, modifier: Modifier, danger: Boolean = false, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(modifier.height(38.dp).clip(CircleShape).background(if (danger) p.lab else p.bg.copy(alpha = .14f)).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Text(text, color = if (danger) p.onLab else p.bg, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1)
    }
}

/* ================= Ikoner i fanelinja ================= */

/** Ikonene i fanelinja tegnes som vektorikoner (tegnene finnes ikke i alle fonter, f.eks. «◉» for Familie). */
internal fun glyphVector(g: String): ImageVector? = when (g) {
    "kr" -> Icons.Filled.AccountBalanceWallet
    "◐" -> Icons.Filled.Restaurant
    "◎" -> Icons.Filled.Language
    "▣" -> Icons.Filled.LocalShipping
    "◉" -> Icons.Filled.Map
    "⇄" -> Icons.Filled.DirectionsBus
    "☀" -> Icons.Filled.WbSunny
    "▤" -> Icons.Filled.Newspaper
    "↗" -> Icons.AutoMirrored.Filled.ShowChart
    "⌂" -> Icons.Filled.Home
    "↻" -> Icons.Filled.Autorenew
    "♪" -> Icons.Filled.MusicNote
    "⌕" -> Icons.Filled.Search
    "⋯" -> Icons.Filled.MoreHoriz
    "★" -> Icons.Filled.Star
    "♥" -> Icons.Filled.Favorite
    "✉" -> Icons.Filled.Mail
    "⚑" -> Icons.Filled.Flag
    "◆" -> Icons.Filled.Diamond
    "✓" -> Icons.Filled.Checklist
    else -> null
}

@Composable
internal fun GlyphIcon(g: String, color: Color, size: Dp = 17.dp) {
    val v = glyphVector(g)
    if (v != null) Icon(v, null, tint = color, modifier = Modifier.size(size))
    else Text(g, color = color, fontSize = 15.sp, lineHeight = 15.sp)
}
