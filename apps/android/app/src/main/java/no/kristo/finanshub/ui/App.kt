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

/** Skanneknappen: trykk = kamera med en gang, hold inne = valg (kan byttes i Innstillinger → Skanning). */
class ScanActions(val camera: () -> Unit, val sheet: () -> Unit, private val tapOpensCamera: Boolean) {
    fun tap() = if (tapOpensCamera) camera() else sheet()
    fun hold() = if (tapOpensCamera) sheet() else camera()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FinansApp(vm: AppViewModel, width: WindowWidthSizeClass, unlock: () -> Unit, onPrivacyChanged: () -> Unit) {
    if (!vm.loggedIn || vm.addingAccount) { PaperLogin(vm); return }
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

    // Prompt 42: Papir er det eneste mobildesignet (Material You-«Klassisk» er slettet): eget skall med fotovindu og fanelinje.
    PaperApp(vm, snack, takePhoto, pickPhotos, pickFiles, onPrivacyChanged, wide = width != WindowWidthSizeClass.Compact)
    if (vm.menuOpen) ProfileSheet(vm)
    if (vm.widgetGallery) WidgetGallery(vm)
}

/**
 * De felles skjermene som Papir-skallet (PaperApp) viser i sin innholdsboks. Hjem, Finans, Liste, Finn, Sporing, Domener,
 * Mat, Boliger, Innstillinger og kvitteringskøen har egne Papir-sider og kommer aldri hit (prompt 42: Klassisk er slettet).
 */
@Composable
internal fun MainPane(vm: AppViewModel, twoPane: Boolean, scan: ScanActions, onPrivacyChanged: () -> Unit) {
    when (vm.screen) {
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
        Screen.Sub -> SubsMobileScreen(vm)
        else -> {}
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
    // Prompt 39: uten bilde alltid initialer på #2B5D8A (som iPhone og web), aldri en tom sirkel.
    else Box(Modifier.size(size.dp).clip(CircleShape).background(AV39_BG), contentAlignment = Alignment.Center) {
        Text(initials39(vm.displayName), color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size * 0.36).sp, maxLines = 1)
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
            MenuRow("Gjøremål", "To-do for hele familien", Icons.Filled.Checklist, vm.tasksOpen, 7, 8) { vm.menuOpen = false; vm.openTasks() }
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
