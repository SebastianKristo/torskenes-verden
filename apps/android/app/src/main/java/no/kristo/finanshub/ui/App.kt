package no.kristo.finanshub.ui

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import no.kristo.finanshub.*
import java.io.File

private val tabIcons: Map<Screen, ImageVector> = mapOf(
    Screen.Home to Icons.Filled.Home, Screen.List to Icons.AutoMirrored.Filled.List, Screen.Budget to Icons.Filled.PieChart,
)
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
    if (!vm.loggedIn || vm.addingAccount) { LoginScreen(vm); return }
    if (vm.locked) { LockScreen(vm, unlock); return }
    val ctx = LocalContext.current
    val snack = remember { SnackbarHostState() }
    LaunchedEffect(vm.message) { vm.message?.let { snack.showSnackbar(it); vm.message = null } }

    // Kamera (systemets kamera-app, bakkamera), Bilder (fotovelger) og Filer (PDF, JPG, HEIC).
    var photoUri by remember { mutableStateOf<Uri?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) photoUri?.let(vm::uploadUri) }
    val photos = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(20)) { uris -> vm.uploadUris(uris) }
    val files = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> vm.uploadUris(uris) }
    val takePhoto: () -> Unit = {
        val dir = File(ctx.cacheDir, "scans").apply { mkdirs() }
        val f = File(dir, "kvittering-${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
        photoUri = uri
        camera.launch(uri)
    }
    val scan = ScanActions(takePhoto, { vm.scanSheet = true }, vm.option(AppPrefs.SCAN_TAP, "camera") == "camera")

    val twoPane = width != WindowWidthSizeClass.Compact
    val s = vm.screen
    BackHandler(enabled = !s.isFinance || s == Screen.Scan) {
        when {
            s == Screen.Settings && vm.settingsPage != null -> vm.settingsPage = null
            s == Screen.Folders && vm.folder != null -> vm.folder = null
            else -> vm.go(Screen.Home)
        }
    }
    Scaffold(
        containerColor = C.bg,
        snackbarHost = { SnackbarHost(snack) },
        bottomBar = {
            if (!twoPane) when {
                s == Screen.Home || s == Screen.List || s == Screen.Budget -> NavigationBar(containerColor = C.surface1) {
                    listOf(Screen.Home, Screen.List, Screen.Budget).forEach { t ->
                        NavigationBarItem(selected = s == t, onClick = { vm.go(t) }, icon = { Icon(tabIcons.getValue(t), null) }, label = { Text(t.label) })
                    }
                }
                // Domener: fanelinja byttes ut med Trafikk, Besøk, Ytelse og Sikkerhet.
                s == Screen.Domains -> NavigationBar(containerColor = P.card) {
                    DomTab.entries.forEach { t ->
                        NavigationBarItem(selected = vm.domTab == t, onClick = { vm.domTab = t }, icon = { Icon(domIcons.getValue(t), null) }, label = { Text(t.label) },
                            colors = NavigationBarItemDefaults.colors(indicatorColor = P.hero, selectedIconColor = P.onHero, selectedTextColor = P.accent))
                    }
                }
                else -> {}
            }
        },
        floatingActionButton = {
            if (!twoPane && (s == Screen.Home || s == Screen.List || s == Screen.Budget) && vm.selectedTx == null) ScanFab(scan)
        },
    ) { pad ->
        Row(Modifier.fillMaxSize().padding(pad)) {
            if (twoPane) Rail(vm, scan)
            when {
                s.isFinance -> {
                    // Liste til venstre, detaljer til høyre når skjermen er bred (åpen brettbar).
                    Box(Modifier.weight(1f).fillMaxHeight()) { MainPane(vm, twoPane, scan) }
                    if (twoPane) Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(topStart = 28.dp, bottomStart = 28.dp)).background(Color(0xFF1E1712))) { DetailPane(vm) }
                }
                // Modulene fyller hele skjermen.
                else -> Box(Modifier.weight(1f).fillMaxHeight()) { ModulePane(vm, twoPane, onPrivacyChanged) }
            }
        }
        if (vm.busy) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = C.primary) }
    }
    if (vm.menuOpen) { if (twoPane) SideMenu(vm) else ProfileSheet(vm) }
    if (vm.scanSheet) ScanSheet(vm, takePhoto,
        photos = { photos.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
        files = { files.launch(arrayOf("application/pdf", "image/jpeg", "image/heic", "image/heif", "image/png")) })
}

@Composable
private fun MainPane(vm: AppViewModel, twoPane: Boolean, scan: ScanActions) {
    when (vm.screen) {
        Screen.Home, Screen.List -> if (!twoPane && vm.selectedTx != null) {
            BackHandler { vm.selectedTx = null }
            TxDetail(vm, back = { vm.selectedTx = null })
        } else if (vm.screen == Screen.Home) HomeScreen(vm) else ListScreen(vm, twoPane)
        Screen.Budget -> BudgetScreen(vm)
        Screen.Scan -> if (!twoPane && vm.selectedReceipt != null) {
            BackHandler { vm.selectedReceipt = null }
            ReceiptConfirm(vm, back = { vm.selectedReceipt = null })
        } else ScanQueue(vm, scan.camera, scan.sheet)
        else -> {}
    }
}

@Composable
private fun DetailPane(vm: AppViewModel) {
    when (vm.screen) {
        Screen.Scan -> if (vm.selectedReceipt != null) ReceiptConfirm(vm, back = null) else Empty("Velg en kvittering.")
        Screen.Budget -> BudgetDetail(vm)
        else -> TxDetail(vm, back = null)
    }
}

@Composable
private fun ModulePane(vm: AppViewModel, twoPane: Boolean, onPrivacyChanged: () -> Unit) {
    when (vm.screen) {
        Screen.Mat -> MatScreen(vm)
        Screen.Domains -> DomainsScreen(vm, twoPane)
        Screen.Sub -> SubScreen(vm)
        Screen.Folders -> FoldersScreen(vm)
        Screen.Finn -> FinnScreen(vm)
        Screen.Settings -> SettingsScreen(vm, onPrivacyChanged)
        else -> {}
    }
}

/* ---------------- Navigasjon ---------------- */

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

/** Brettbar: navigasjonsrail med skanneknappen øverst og profilbildet nederst til venstre. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Rail(vm: AppViewModel, scan: ScanActions) {
    NavigationRail(containerColor = C.surface1, header = {
        Surface(color = C.primary, contentColor = C.onPrimary, shape = RoundedCornerShape(16.dp),
            modifier = Modifier.padding(top = 8.dp).size(56.dp).clip(RoundedCornerShape(16.dp)).combinedClickable(onLongClick = scan::hold, onClick = scan::tap)) {
            Box(contentAlignment = Alignment.Center) { Icon(Icons.Filled.DocumentScanner, "Skann") }
        }
    }) {
        Spacer(Modifier.height(8.dp))
        listOf(Screen.Home, Screen.List, Screen.Budget).forEach { t ->
            NavigationRailItem(selected = vm.screen == t, onClick = { vm.go(t) }, icon = { Icon(tabIcons.getValue(t), null) }, label = { Text(t.label) })
        }
        if (vm.screen == Screen.Scan) NavigationRailItem(selected = true, onClick = {}, icon = { Icon(Icons.Filled.CloudUpload, null) }, label = { Text("Last opp") })
        if (!vm.screen.isFinance) NavigationRailItem(selected = true, onClick = {}, icon = { Icon(moduleIcon(vm.screen), null) }, label = { Text(vm.screen.label, maxLines = 1, overflow = TextOverflow.Ellipsis) })
        Spacer(Modifier.weight(1f))
        Box(Modifier.padding(bottom = 16.dp)) { Avatar(vm) }
    }
}

internal fun moduleIcon(s: Screen): ImageVector = when (s) {
    Screen.Mat -> Icons.Filled.Restaurant
    Screen.Domains -> Icons.Filled.Language
    Screen.Sub -> Icons.Filled.Autorenew
    Screen.Folders -> Icons.Filled.FolderShared
    Screen.Finn -> Icons.Filled.Storefront
    Screen.Settings -> Icons.Filled.Settings
    else -> Icons.Filled.Home
}

/** Profilbildet: trykk åpner menyen, hold inne for raskt kontobytte. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun Avatar(vm: AppViewModel, size: Int = 44) {
    var quick by remember { mutableStateOf(false) }
    Box {
        Box(
            Modifier.size(size.dp).clip(CircleShape).background(C.container)
                .combinedClickable(onClickLabel = "Meny", onLongClickLabel = "Bytt konto", onLongClick = { if (vm.accounts.size > 1) quick = true else vm.menuOpen = true }, onClick = { vm.menuOpen = true }),
            contentAlignment = Alignment.Center,
        ) { Text(initial(vm.displayName.ifBlank { "S" }), color = C.onContainer, fontWeight = FontWeight.SemiBold, fontSize = (size * 0.38).sp) }
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

internal fun host(url: String) = url.removePrefix("https://").removePrefix("http://")

/** Innholdet i menyen bak profilbildet: Finans, Andre OS og Innstillinger. */
@Composable
private fun MenuContent(vm: AppViewModel) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp, 0.dp, 20.dp, 32.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(vertical = 8.dp)) {
            Box(Modifier.size(52.dp).clip(CircleShape).background(C.container), contentAlignment = Alignment.Center) {
                Text(initial(vm.displayName.ifBlank { "S" }), color = C.onContainer, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
            }
            Column(Modifier.weight(1f)) {
                Text(vm.displayName, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${vm.account?.username?.ifBlank { null } ?: "konto"} · ${vm.me?.role ?: vm.account?.role ?: ""} · ${host(vm.base)}", color = C.text2, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        MenuRow("Finans", Icons.Filled.Savings, vm.screen.isFinance, 0, 1) { vm.go(Screen.Home) }
        SectionLabel("Andre OS")
        val mods = listOf(Screen.Mat, Screen.Domains, Screen.Sub, Screen.Folders, Screen.Finn)
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            mods.forEachIndexed { i, m -> MenuRow(m.label, moduleIcon(m), vm.screen == m, i, mods.size) { vm.go(m) } }
        }
        if (vm.accounts.size > 1) {
            SectionLabel("Kontoer")
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                vm.accounts.forEachIndexed { i, a ->
                    MenuRow("${a.name.ifBlank { a.username.ifBlank { "Konto" } }} · ${host(a.server)}", Icons.Filled.AccountCircle, a.id == vm.activeId, i, vm.accounts.size) { if (a.id != vm.activeId) vm.switchTo(a.id) }
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        MenuRow("Innstillinger", Icons.Filled.Settings, vm.screen == Screen.Settings, 0, 2) { vm.settingsPage = null; vm.go(Screen.Settings) }
        MenuRow("Legg til konto", Icons.Filled.PersonAdd, false, 1, 2) { vm.menuOpen = false; vm.addingAccount = true }
    }
}

@Composable
private fun MenuRow(label: String, icon: ImageVector, on: Boolean, i: Int, n: Int, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(itemShape(i, n)).background(if (on) C.container else C.surface2).clickable(onClick = onClick).padding(16.dp, 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(icon, null, tint = if (on) C.onContainer else C.text2)
        Text(label, Modifier.weight(1f), color = if (on) C.onContainer else C.text, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileSheet(vm: AppViewModel) {
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
private fun ScanSheet(vm: AppViewModel, camera: () -> Unit, photos: () -> Unit, files: () -> Unit) {
    ModalBottomSheet(onDismissRequest = { vm.scanSheet = false }, containerColor = C.surface1) {
        Column(Modifier.fillMaxWidth().padding(20.dp, 0.dp, 20.dp, 32.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("Legg til kvittering", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 12.dp))
            MenuRow("Ta bilde", Icons.Filled.PhotoCamera, false, 0, 3) { vm.scanSheet = false; camera() }
            MenuRow("Velg fra Bilder", Icons.Filled.PhotoLibrary, false, 1, 3) { vm.scanSheet = false; photos() }
            MenuRow("Velg fil (PDF, JPG, HEIC)", Icons.Filled.Description, false, 2, 3) { vm.scanSheet = false; files() }
            Spacer(Modifier.height(10.dp))
            OutlinedButton(onClick = { vm.scanSheet = false }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp)) { Text("Avbryt") }
            Text("Filene legges i opplastingskøen, og Gemini leser dem i bakgrunnen.", color = C.text2, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp, start = 8.dp))
        }
    }
}

@Composable
private fun LockScreen(vm: AppViewModel, unlock: () -> Unit) {
    Column(Modifier.fillMaxSize().background(C.bg).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(18.dp, Alignment.CenterVertically)) {
        Box(Modifier.size(72.dp).clip(RoundedCornerShape(24.dp)).background(C.accent), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Lock, null, tint = Color(0xFF1A0C04), modifier = Modifier.size(32.dp)) }
        Text("FinansHub er låst", style = MaterialTheme.typography.headlineMedium)
        Text(vm.displayName, color = C.text2)
        Button(onClick = unlock, modifier = Modifier.fillMaxWidth().widthIn(max = 360.dp).height(56.dp), shape = RoundedCornerShape(28.dp),
            colors = ButtonDefaults.buttonColors(containerColor = C.primary, contentColor = C.onPrimary)) {
            Icon(Icons.Filled.Fingerprint, null); Spacer(Modifier.width(8.dp)); Text("Lås opp", fontWeight = FontWeight.Bold)
        }
    }
}
