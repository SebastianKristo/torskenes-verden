package no.kristo.finanshub.ui

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import no.kristo.finanshub.*
import java.io.File

/** Ikon per skjerm (faner, rail og meny). */
internal fun screenIcon(s: Screen): ImageVector = when (s) {
    Screen.Homelab -> Icons.Filled.Dashboard
    Screen.Home -> Icons.Filled.Home
    Screen.List -> Icons.AutoMirrored.Filled.List
    Screen.Budget -> Icons.Filled.PieChart
    Screen.Search -> Icons.Filled.AutoAwesome
    Screen.More -> Icons.Filled.GridView
    Screen.Scan -> Icons.Filled.Receipt
    Screen.Fast -> Icons.Filled.Repeat
    Screen.Accounts -> Icons.Filled.AccountBalance
    Screen.Stocks -> Icons.AutoMirrored.Filled.ShowChart
    Screen.Reports -> Icons.Filled.BarChart
    Screen.Import -> Icons.Filled.FileUpload
    Screen.Mat -> Icons.Filled.Restaurant
    Screen.Domains -> Icons.Filled.Language
    Screen.Sub -> Icons.Filled.Autorenew
    Screen.Folders -> Icons.Filled.FolderShared
    Screen.Finn -> Icons.Filled.Storefront
    Screen.Settings -> Icons.Filled.Settings
    Screen.Tracking -> Icons.Filled.LocalShipping
}
internal fun moduleIcon(s: Screen): ImageVector = screenIcon(s)

/** Toppraden «‹ Homelab»/«‹ Finans» vises; da står profilbildet der og ikke i overskriften under. */
internal val LocalTopRow = staticCompositionLocalOf { false }
private val LocalInTopRow = staticCompositionLocalOf { false }

private val domIcons: Map<DomTab, ImageVector> = mapOf(
    DomTab.Traffic to Icons.AutoMirrored.Filled.ShowChart, DomTab.Visits to Icons.Filled.Public, DomTab.Perf to Icons.Filled.Speed, DomTab.Security to Icons.Filled.Shield,
)

/** Skanneknappen: trykk = kamera med en gang, hold inne = valg (kan byttes i Innstillinger → Skanning). */
class ScanActions(val camera: () -> Unit, val sheet: () -> Unit, private val tapOpensCamera: Boolean) {
    fun tap() = if (tapOpensCamera) camera() else sheet()
    fun hold() = if (tapOpensCamera) sheet() else camera()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FinansApp(vm: AppViewModel, width: WindowWidthSizeClass, unlock: () -> Unit, onPrivacyChanged: () -> Unit) {
    if (!vm.loggedIn || vm.addingAccount) { if (vm.paper) PaperLogin(vm) else LoginScreen(vm); return }
    if (vm.locked) { LockScreen(vm, unlock); return }
    // Første gang etter innlogging på en ny installasjon: velg design, bakgrunn og tilganger.
    if (vm.onboardNeeded) { PaperOnboarding(vm); return }
    val ctx = LocalContext.current
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(vm.message) { vm.message?.let { snack.showSnackbar(it); vm.message = null } }

    // Kamera (systemets kamera-app, bakkamera), Bilder (fotovelger) og Filer (PDF, JPG, HEIC).
    var photoUri by remember { mutableStateOf<Uri?>(null) }
    // Kvittering eller oppskrift (vm.scanTarget): Mat-siden skanner oppskrifter, ellers kvitteringer.
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) photoUri?.let { vm.scanUris(listOf(it)) } }
    val photos = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(20)) { uris -> vm.scanUris(uris) }
    val files = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> vm.scanUris(uris) }
    val takePhoto: () -> Unit = {
        val dir = File(ctx.cacheDir, "scans").apply { mkdirs() }
        val f = File(dir, "kvittering-${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
        photoUri = uri
        camera.launch(uri)
    }
    val scan = ScanActions(takePhoto, { vm.scanSheet = true }, vm.option(AppPrefs.SCAN_TAP, "camera") == "camera")
    // Skann-widgeten: finanshub://scan/camera eller /files.
    LaunchedEffect(vm.pendingScan) {
        when (vm.pendingScan) {
            "camera" -> takePhoto()
            "files" -> files.launch(arrayOf("application/pdf", "image/jpeg", "image/heic", "image/heif", "image/png"))
        }
        vm.pendingScan = null
    }

    val pickFiles: () -> Unit = { files.launch(arrayOf("application/pdf", "image/jpeg", "image/heic", "image/heif", "image/png")) }
    val pickPhotos: () -> Unit = { photos.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }

    // Mobildesign «Papir»: eget skall med fotovindu og fanelinje, samme sider og API-er som Klassisk.
    if (vm.paper) {
        PaperApp(vm, snack, takePhoto, pickPhotos, pickFiles, onPrivacyChanged, wide = width != WindowWidthSizeClass.Compact)
        if (vm.menuOpen) ProfileSheet(vm)
        if (vm.widgetGallery) WidgetGallery(vm)
        return
    }

    val twoPane = width != WindowWidthSizeClass.Compact
    val s = vm.screen
    val overlay = vm.original != null || vm.editing != null || vm.detail != null
    // Tilbake: lukker det som er åpent, ellers forrige side. På startsiden uten noe åpent lukkes appen som vanlig.
    val canBack = overlay || vm.editHome || s != vm.startPage || vm.selectedTx != null || vm.matFull || vm.finnSel != null
    BackHandler(enabled = canBack) { vm.back() }
    // Mat er en egen flate: ingen fanelinje, skanneknapp eller rail, bare pilen øverst og profilmenyen.
    val matSurface = s == Screen.Mat && !vm.matFull && !overlay
    val topRow = vm.topRowTitle(!twoPane)

    CompositionLocalProvider(LocalTopRow provides (topRow != null)) {
    Scaffold(
        containerColor = if (matSurface) matPalette(vm).bg else C.bg,
        snackbarHost = { SnackbarHost(snack) },
        bottomBar = { if (!twoPane && !overlay) BottomBar(vm) },
        floatingActionButton = {
            val fab = s.isFinance && s != Screen.Search && s != Screen.Import && vm.selectedTx == null && !overlay
            if (!twoPane && fab) ScanFab(scan)
        },
    ) { pad ->
        // Mat går helt ned til kanten (listen legger selv på plass til navigasjonslinja), så ingenting kuttes nederst.
        Row(Modifier.fillMaxSize().padding(if (matSurface) PaddingValues(top = pad.calculateTopPadding()) else pad)) {
            if (twoPane && s != Screen.Mat) Rail(vm, scan)
            when {
                vm.original != null -> Box(Modifier.weight(1f).fillMaxHeight()) { OriginalScreen(vm) }
                vm.editing != null -> Box(Modifier.weight(1f).fillMaxHeight()) { TxEditScreen(vm, vm.editing!!, scan) }
                vm.detail != null -> Box(Modifier.weight(1f).fillMaxHeight()) { DetailScreen(vm, vm.detail!!) }
                twoPane && s in setOf(Screen.Home, Screen.List, Screen.Budget, Screen.Search, Screen.Scan) -> {
                    // Liste til venstre, detaljer til høyre når skjermen er bred (åpen brettbar).
                    Box(Modifier.weight(1f).fillMaxHeight()) { MainPane(vm, true, scan, onPrivacyChanged) }
                    Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(topStart = 28.dp, bottomStart = 28.dp)).background(tc(0xFF1E1712))) { DetailPane(vm) }
                }
                matSurface -> Box(Modifier.weight(1f).fillMaxHeight()) { MatSurface(vm) }
                else -> Column(Modifier.weight(1f).fillMaxHeight()) {
                    if (topRow != null) TopBackRow(vm, topRow, if (s == Screen.Domains) P.accent else C.text, if (s == Screen.Domains) P.card else C.surface2, null,
                        Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp))
                    Box(Modifier.weight(1f).fillMaxWidth()) { MainPane(vm, twoPane, scan, onPrivacyChanged) }
                }
            }
        }
        if (vm.busy) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) }
    }
    }
    if (vm.domainManager) DomainManagerSheet(vm)
    if (vm.menuOpen) { if (twoPane) SideMenu(vm) else ProfileSheet(vm) }
    if (vm.widgetGallery) WidgetGallery(vm)
    if (vm.scanSheet) ScanSheet(vm, takePhoto, photos = pickPhotos, files = pickFiles)
    if (vm.newsOpen) NewsReader(vm)
    if (vm.weatherOpen) WeatherApp(vm)
    if (vm.ruterOpen) RuterScreen24(vm)
    if (vm.familyOpen) FamilyScreen(vm)
    if (vm.tasksOpen) TasksScreen(vm)
    if (vm.compareOpen) CompareScreen(vm)
}

@Composable
internal fun MainPane(vm: AppViewModel, twoPane: Boolean, scan: ScanActions, onPrivacyChanged: () -> Unit) {
    val s = vm.screen
    // Telefon: trykk på en rad åpner utgiftsdetaljen over listen.
    if (!twoPane && s.isFinance && s != Screen.Scan && vm.selectedTx != null) { TxDetail(vm, back = { vm.selectedTx = null }); return }
    when (s) {
        Screen.Homelab -> HomelabScreen(vm, twoPane)
        Screen.Home -> HomeScreen(vm)
        Screen.List -> ListScreen(vm, twoPane)
        Screen.Budget -> BudgetScreen(vm)
        Screen.Search -> SearchScreen(vm)
        Screen.More -> MoreScreen(vm)
        Screen.Scan -> if (!twoPane && vm.selectedReceipt != null) ReceiptConfirm(vm, back = { vm.selectedReceipt = null }) else ScanQueue(vm, scan.camera, scan.sheet)
        Screen.Fast -> FastScreen(vm)
        Screen.Accounts -> AccountsScreen(vm)
        Screen.Stocks -> StocksMobileScreen(vm)
        Screen.Reports -> ReportsScreen(vm)
        Screen.Import -> ImportScreen(vm)
        Screen.Mat -> MatScreen(vm)
        Screen.Domains -> DomainsScreen(vm, twoPane)
        Screen.Sub -> SubsMobileScreen(vm)
        Screen.Folders -> FoldersScreen(vm)
        Screen.Finn -> FinnScreen(vm)
        Screen.Settings -> SettingsScreen(vm, onPrivacyChanged)
        Screen.Tracking -> TrackingScreen(vm)
    }
}

@Composable
private fun DetailPane(vm: AppViewModel) {
    when (vm.screen) {
        Screen.Scan -> if (vm.selectedReceipt != null) ReceiptConfirm(vm, back = null) else Empty("Velg en kvittering.")
        Screen.Budget -> BudgetDetail(vm)
        else -> if (vm.selectedTx == null && vm.screen == Screen.Search) Empty("Velg et treff.") else TxDetail(vm, back = null)
    }
}

/* ---------------- Navigasjon ---------------- */

/**
 * Bunnlinja: Homelab-fanene på Homelab, Finans-fanene i Finans og Trafikk/Besøk/Ytelse/Sikkerhet i Domener.
 * Mat har ingen. Med «Knapp i linjen» står startsiden helt til venstre, skilt med en tynn strek.
 */
@Composable
private fun BottomBar(vm: AppViewModel) {
    val s = vm.screen
    when {
        s == Screen.Homelab || s == Screen.Tracking -> NavigationBar(containerColor = C.surface1) {
            vm.hlTabs.forEach { t ->
                NavigationBarItem(selected = s == t, onClick = { if (s != t) Haptics.select(); vm.go(t) }, icon = { Icon(screenIcon(t), null) }, label = { Text(vm.hlName(t), maxLines = 1, overflow = TextOverflow.Ellipsis) })
            }
        }
        s.isFinance -> NavigationBar(containerColor = C.surface1) {
            if (vm.homeInBar && !vm.financeStart) HomeItem(vm)
            vm.finTabs.forEach { t ->
                // Mer er markert på undersidene, og på Budsjett/Finn når de ikke er egne faner.
                val on = s == t || (t == Screen.More && (s.isMorePage || (s in setOf(Screen.Budget, Screen.Finn) && s !in vm.finTabs)))
                NavigationBarItem(selected = on, onClick = { if (!on) Haptics.select(); vm.go(t) }, icon = { Icon(screenIcon(t), null) }, label = { Text(vm.finName(t), maxLines = 1, overflow = TextOverflow.Ellipsis) })
            }
        }
        // Domener: fanelinja byttes ut med Trafikk, Besøk, Ytelse og Sikkerhet.
        s == Screen.Domains -> NavigationBar(containerColor = P.card) {
            if (vm.homeInBar) HomeItem(vm)
            DomTab.entries.forEach { t ->
                NavigationBarItem(selected = vm.domTab == t, onClick = { if (vm.domTab != t) Haptics.select(); vm.domTab = t }, icon = { Icon(domIcons.getValue(t), null) }, label = { Text(t.label, maxLines = 1) },
                    colors = NavigationBarItemDefaults.colors(indicatorColor = P.hero, selectedIconColor = P.onHero, selectedTextColor = P.accent))
            }
        }
        else -> {}
    }
}

/** Startsiden («Homelab» eller «Finans») helt til venstre i bunnlinja, med en tynn strek mot resten. */
@Composable
private fun RowScope.HomeItem(vm: AppViewModel) {
    NavigationBarItem(selected = false, onClick = { vm.goStart() }, icon = { Icon(if (vm.financeStart) Icons.Filled.Savings else Icons.Filled.Dashboard, null) }, label = { Text(vm.startLabel, maxLines = 1) })
    Box(Modifier.padding(vertical = 18.dp).width(1.dp).height(36.dp).background(C.outline.copy(alpha = .4f)).align(Alignment.CenterVertically))
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ScanFab(scan: ScanActions) {
    Surface(
        color = C.primary, contentColor = C.onPrimary, shape = RoundedCornerShape(20.dp), shadowElevation = 6.dp,
        modifier = Modifier.clip(RoundedCornerShape(20.dp)).combinedClickable(onClickLabel = "Skann kvittering", onLongClickLabel = "Velg fra Bilder eller Filer", onLongClick = scan::hold, onClick = scan::tap),
    ) {
        Row(Modifier.height(56.dp).padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Filled.DocumentScanner, null)
            Text("Skann", fontWeight = FontWeight.Bold)
        }
    }
}

/** Brettbar: navigasjonsrail med Homelab-knapp og Skann øverst, fanene, og profilbildet nederst til venstre. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Rail(vm: AppViewModel, scan: ScanActions) {
    val s = vm.screen
    NavigationRail(containerColor = C.surface1, header = {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 8.dp)) {
            FilledTonalIconButton(onClick = { vm.goStart() }, modifier = Modifier.size(48.dp)) { Icon(if (vm.financeStart) Icons.Filled.Savings else Icons.Filled.Dashboard, vm.startLabel) }
            Surface(color = C.primary, contentColor = C.onPrimary, shape = RoundedCornerShape(16.dp),
                modifier = Modifier.size(56.dp).clip(RoundedCornerShape(16.dp)).combinedClickable(onClickLabel = "Skann kvittering", onLongClickLabel = "Velg fra Bilder eller Filer", onLongClick = scan::hold, onClick = scan::tap)) {
                Box(contentAlignment = Alignment.Center) { Icon(Icons.Filled.DocumentScanner, "Skann") }
            }
        }
    }) {
        Spacer(Modifier.height(8.dp))
        val tabs = if (s.isFinance) vm.finTabs else vm.hlTabs.filter { it != Screen.Homelab }
        tabs.forEach { t ->
            val on = s == t || (t == Screen.More && (s.isMorePage || (s in setOf(Screen.Budget, Screen.Finn) && s !in vm.finTabs)))
            NavigationRailItem(selected = on, onClick = { vm.go(t) }, icon = { Icon(screenIcon(t), null) }, label = { Text(if (s.isFinance) vm.finName(t) else vm.hlName(t), maxLines = 1, overflow = TextOverflow.Ellipsis) })
        }
        if (s.isMorePage) NavigationRailItem(selected = true, onClick = {}, icon = { Icon(screenIcon(s), null) }, label = { Text(s.label, maxLines = 1, overflow = TextOverflow.Ellipsis) })
        if (s == Screen.Settings) NavigationRailItem(selected = true, onClick = {}, icon = { Icon(screenIcon(s), null) }, label = { Text(s.label, maxLines = 1, overflow = TextOverflow.Ellipsis) })
        Spacer(Modifier.weight(1f))
        Box(Modifier.padding(bottom = 16.dp)) { Avatar(vm) }
    }
}

/** Profilbilde (eller initial): trykk åpner menyen, hold inne for raskt kontobytte. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun Avatar(vm: AppViewModel, size: Int = 44) {
    if (LocalTopRow.current && !LocalInTopRow.current) return
    var quick by remember { mutableStateOf(false) }
    Box {
        Box(
            Modifier.size(size.dp).clip(CircleShape).background(C.container)
                .combinedClickable(onClickLabel = "Meny", onLongClickLabel = "Bytt konto", onLongClick = { if (vm.accounts.size > 1) quick = true else vm.menuOpen = true }, onClick = { vm.menuOpen = true }),
            contentAlignment = Alignment.Center,
        ) { AvatarImage(vm, size) }
        DropdownMenu(expanded = quick, onDismissRequest = { quick = false }) {
            vm.accounts.forEach { a ->
                DropdownMenuItem(
                    text = { Column { Text(a.name.ifBlank { a.username.ifBlank { "Konto" } }, fontWeight = FontWeight.Medium); Text(host(a.server), fontSize = 12.sp, color = C.text2) } },
                    leadingIcon = { if (a.id == vm.activeId) Icon(Icons.Filled.Check, null, tint = C.primary) else Spacer(Modifier.size(24.dp)) },
                    onClick = { quick = false; if (a.id != vm.activeId) vm.switchTo(a.id) },
                )
            }
        }
    }
}

/** Selve bildet: opplastet profilbilde, ellers initialen. */
@Composable
internal fun AvatarImage(vm: AppViewModel, size: Int, bg: Color = C.container, fg: Color = C.onContainer) {
    val b = vm.avatar
    if (b != null) Image(b.asImageBitmap(), "Profilbilde", contentScale = ContentScale.Crop, modifier = Modifier.size(size.dp).clip(CircleShape))
    else Box(Modifier.size(size.dp).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
        Text(initial(vm.displayName.ifBlank { "•" }), color = fg, fontWeight = FontWeight.SemiBold, fontSize = (size * 0.38).sp)
    }
}

/** «‹ Homelab» / «‹ Finans» øverst, med profilbildet helt til høyre på samme rad. */
@Composable
internal fun TopBackRow(vm: AppViewModel, title: String, fg: Color, bg: Color, border: Color?, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(
            Modifier.height(40.dp).clip(CircleShape).background(bg)
                .then(if (border != null) Modifier.border(1.dp, border, CircleShape) else Modifier)
                .clickable(onClickLabel = "Tilbake til $title") { vm.goStart() }.padding(start = 8.dp, end = 16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, null, tint = fg)
            Text(title, color = fg, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        }
        Spacer(Modifier.weight(1f))
        CompositionLocalProvider(LocalInTopRow provides true) { Avatar(vm, 40) }
    }
}

internal fun host(url: String) = url.removePrefix("https://").removePrefix("http://")

/** Menyen bak profilbildet: Homelab, Andre OS (Finans, Mat, Domener), Rediger forsiden og Innstillinger. */
@Composable
private fun MenuContent(vm: AppViewModel) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp, 0.dp, 20.dp, 32.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(vertical = 8.dp)) {
            AvatarImage(vm, 52)
            Column(Modifier.weight(1f)) {
                // Prompt 30: ikke brukernavn ved profilbildet (bare i Innstillinger → Konto).
                Text(vm.displayName.ifBlank { "Konto" }, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${vm.me?.role ?: vm.account?.role ?: ""} · ${vm.me?.serverName ?: vm.mobileHome?.serverName ?: host(vm.base)}",
                    color = C.text2, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        MenuRow("Homelab", "Dashbord, søk og snarveier", Icons.Filled.Dashboard, vm.screen == Screen.Homelab, 0, 1) { vm.editHome = false; vm.go(Screen.Homelab) }
        SectionLabel("Andre OS")
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            MenuRow("Finans", "Hjem, liste, budsjett og mer", Icons.Filled.Savings, vm.screen.isFinance, 0, 8) { vm.go(if (vm.financeStart) vm.startPage else Screen.Home) }
            MenuRow("Mat", "Ukemeny, oppskrifter og handleliste", Icons.Filled.Restaurant, vm.screen == Screen.Mat, 1, 8) { vm.go(Screen.Mat) }
            MenuRow("Domener", "Trafikk, besøk, ytelse og sikkerhet", Icons.Filled.Language, vm.screen == Screen.Domains, 2, 8) { vm.go(Screen.Domains) }
            MenuRow("Sporing", "Pakker på vei, henting og varsler", Icons.Filled.LocalShipping, vm.screen == Screen.Tracking, 3, 8) { vm.go(Screen.Tracking) }
            MenuRow("Nyhetsleser", "RSS med ✦ AI-sammendrag", Icons.Filled.Newspaper, vm.newsOpen, 4, 8) { vm.openNews() }
            MenuRow("Familie og kart", "Posisjon, soner og helse", Icons.Filled.MyLocation, vm.familyOpen, 5, 8) { vm.menuOpen = false; vm.openFamily() }
            MenuRow("Avganger", "Ruter i sanntid og egne stopp", Icons.Filled.DirectionsBus, vm.ruterOpen, 6, 8) { vm.menuOpen = false; vm.openRuter() }
            MenuRow("Huskeliste", "Oppgaver for hele familien", Icons.Filled.Checklist, vm.tasksOpen, 7, 8) { vm.menuOpen = false; vm.openTasks() }
        }
        Spacer(Modifier.height(4.dp))
        MenuRow("Rediger forsiden", "Widgets og fanelinjer", Icons.Filled.Edit, vm.editHome, 0, 1) { vm.go(Screen.Homelab); vm.editHome = true }
        if (vm.accounts.size > 1) {
            SectionLabel("Kontoer")
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                vm.accounts.forEachIndexed { i, a ->
                    MenuRow("${a.name.ifBlank { a.username.ifBlank { "Konto" } }} · ${host(a.server)}", null, Icons.Filled.AccountCircle, a.id == vm.activeId, i, vm.accounts.size) { if (a.id != vm.activeId) vm.switchTo(a.id) }
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        MenuRow("Innstillinger", null, Icons.Filled.Settings, vm.screen == Screen.Settings, 0, 2) { vm.settingsPage = null; vm.open(Screen.Settings) }
        MenuRow("Legg til konto", null, Icons.Filled.PersonAdd, false, 1, 2) { vm.menuOpen = false; vm.addingAccount = true }
    }
}

@Composable
internal fun MenuRow(label: String, sub: String?, icon: ImageVector, on: Boolean, i: Int, n: Int, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(itemShape(i, n)).background(if (on) C.container else C.surface2).clickable(onClick = onClick).padding(16.dp, 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(icon, null, tint = if (on) C.onContainer else C.text2)
        Column(Modifier.weight(1f)) {
            Text(label, color = if (on) C.onContainer else C.text, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
            sub?.let { Text(it, color = if (on) C.onContainer.copy(alpha = .8f) else C.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ProfileSheet(vm: AppViewModel) {
    ModalBottomSheet(onDismissRequest = { vm.menuOpen = false }, containerColor = C.surface1) { MenuContent(vm) }
}

/** Brettbar: menyen åpnes fra venstre. */
@Composable
private fun SideMenu(vm: AppViewModel) {
    BackHandler { vm.menuOpen = false }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .45f)).clickable { vm.menuOpen = false }) {
        Column(Modifier.fillMaxHeight().width(360.dp).clip(RoundedCornerShape(topEnd = 28.dp, bottomEnd = 28.dp)).background(C.surface1).clickable(remember { MutableInteractionSource() }, null) {}.statusBarsPadding().padding(top = 16.dp)) {
            MenuContent(vm)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ScanSheet(vm: AppViewModel, camera: () -> Unit, photos: () -> Unit, files: () -> Unit) {
    ModalBottomSheet(onDismissRequest = { vm.scanSheet = false }, containerColor = C.surface1) {
        Column(Modifier.fillMaxWidth().padding(20.dp, 0.dp, 20.dp, 32.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(if (vm.scanTarget == "recipe") "Skann oppskrift" else "Legg til kvittering", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 12.dp))
            MenuRow("Ta bilde", null, Icons.Filled.PhotoCamera, false, 0, 3) { vm.scanSheet = false; camera() }
            MenuRow("Velg fra Bilder", null, Icons.Filled.PhotoLibrary, false, 1, 3) { vm.scanSheet = false; photos() }
            MenuRow("Velg fil (PDF, JPG, HEIC)", null, Icons.Filled.Description, false, 2, 3) { vm.scanSheet = false; files() }
            Spacer(Modifier.height(10.dp))
            OutlinedButton(onClick = { vm.scanSheet = false }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Avbryt") }
            Text(if (vm.scanTarget == "recipe") "✦ Gemini leser oppskriften i bakgrunnen og legger retten i en mappe." else "Filene legges i opplastingskøen, og Gemini leser dem i bakgrunnen.",
                color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp, start = 8.dp))
        }
    }
}

@Composable
internal fun LockScreen(vm: AppViewModel, unlock: () -> Unit) {
    Column(Modifier.fillMaxSize().background(C.bg).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp, Alignment.CenterVertically)) {
        Box(Modifier.size(72.dp).clip(RoundedCornerShape(24.dp)).background(C.accent), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Lock, null, tint = tc(0xFF1A0C04), modifier = Modifier.size(32.dp)) }
        Text("FinansHub er låst", style = MaterialTheme.typography.headlineMedium)
        Text(vm.displayName, color = C.text2)
        Button(onClick = unlock, modifier = Modifier.fillMaxWidth().widthIn(max = 360.dp).height(56.dp), shape = RoundedCornerShape(28.dp),
            colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) {
            Icon(Icons.Filled.Fingerprint, null); Spacer(Modifier.width(8.dp)); Text("Lås opp", fontWeight = FontWeight.Bold)
        }
    }
}
