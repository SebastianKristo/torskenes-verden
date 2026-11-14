package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import no.kristo.finanshub.*

/*
 * Prompt 89 (AND89, claude-code-innlogging-server-tannhjul.md): tannhjul øverst til høyre på innloggingsskjermen (Material «settings»,
 * trykkflate 48 dp) → arket «Server» med Ekstern adresse, Lokal adresse, Test tilkobling (GET /api/health), Tilbakestill til standard,
 * Lagre / Avbryt. Lagres der appen allerede husker serveren før innlogging (AccountStore: server + local89); ved innlogging blir det
 * kontoens adresser, og Innstillinger → Server skriver tilbake hit (AppViewModel.updateAddresses) – én felles lagring.
 */

/** Tannhjulet. [onSaved] får den nye eksterne adressen (innloggingen bruker den). */
@Composable
internal fun LoginGear89(modifier: Modifier = Modifier, tint: Color = Color.White, onSaved: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(
        modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Endre server") { Haptics.select(); open = true },
        contentAlignment = Alignment.Center,
    ) { Icon(Icons.Filled.Settings, contentDescription = "Server", tint = tint, modifier = Modifier.size(24.dp)) }
    if (open) ServerSheet89(onClose = { open = false }, onSaved = { open = false; onSaved(it) })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ServerSheet89(onClose: () -> Unit, onSaved: (String) -> Unit) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val store = remember { runCatching { AccountStore(ctx) }.getOrNull() }
    var ext by remember { mutableStateOf(store?.lastServer()?.takeIf { it.isNotBlank() } ?: DEFAULT_EXTERNAL47) }
    var loc by remember { mutableStateOf(store?.lastLocal()?.takeIf { it.isNotBlank() } ?: DEFAULT_LOCAL47) }
    var test by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var busy by remember { mutableStateOf(false) }
    val uri = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false, imeAction = ImeAction.Next)
    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = p.bg, contentColor = p.ink,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp), dragHandle = { BottomSheetDefaults.DragHandle(width = 36.dp, height = 5.dp, color = p.line) }) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(start = 18.dp, end = 18.dp, bottom = 26.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            PSerif("Server", 26.sp)
            PField("Ekstern adresse", ext, { ext = it; test = null }, placeholder = DEFAULT_EXTERNAL47, keyboard = uri)
            PField("Lokal adresse", loc, { loc = it; test = null }, placeholder = DEFAULT_LOCAL47, keyboard = uri.copy(imeAction = ImeAction.Done))
            Text("Lokal brukes når du er hjemme på Wi-Fi, ellers ekstern. Samme verdier som Innstillinger → Server.", color = p.mut, fontSize = 12.5.sp)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PButton(if (busy) "Tester …" else "Test tilkobling", height = 44.dp, kind = "line") {
                    val e = Regel89.clean(ext)
                    if (e == null) { test = false to "Adressen må starte med http:// eller https://"; return@PButton }
                    if (busy) return@PButton
                    busy = true; test = null
                    scope.launch { test = health89(e); busy = false }
                }
                test?.let { (ok, t) ->
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(if (ok) p.pos else p.lab))
                        Text(t, color = if (ok) p.pos else p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 2)
                    }
                }
            }
            Text("Tilbakestill til standard", color = p.lab, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button) { Haptics.select(); ext = DEFAULT_EXTERNAL47; loc = DEFAULT_LOCAL47; test = null }
                    .heightIn(min = 44.dp).wrapContentHeight().padding(vertical = 10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PButton("Avbryt", Modifier.weight(1f), kind = "line") { onClose() }
                PButton("Lagre", Modifier.weight(1f)) {
                    val e = Regel89.clean(ext)
                    val l = if (loc.isBlank()) "" else Regel89.clean(loc)
                    when {
                        e == null -> test = false to "Ekstern adresse må starte med http:// eller https://"
                        l == null -> test = false to "Lokal adresse må starte med http:// eller https://"
                        else -> {
                            store?.rememberServer(e); store?.rememberLocal(l)
                            Haptics.success(); onSaved(e)
                        }
                    }
                }
            }
        }
    }
}

/** GET /api/health uten token → (true, «Tilkoblet») / (false, feilmelding). */
private suspend fun health89(url: String): Pair<Boolean, String> {
    val host = Regel89.hostLabel(url)
    if (cleartextBlocked47(url)) return false to Lokal86.MSG
    return try {
        Api(url, null).request("GET", "/health", prefix = Api.HOMELAB, timeout = 5_000, read = 5_000)
        true to "Tilkoblet · $host"
    } catch (e: CancellationException) { throw e } catch (e: ApiException) {
        if (e.status == 0) false to "Fikk ikke kontakt med $host" else false to "Svarer ikke som Homelab (HTTP ${e.status})"
    } catch (_: Exception) { false to "Fikk ikke kontakt med $host" }
}

/** «Server: os.smarthjemeksperten.no» under innloggingsknappen. */
@Composable
internal fun LoginServerLine89(server: String) {
    val p = PaperPal.current
    Text("Server: " + Regel89.hostLabel(server), color = p.mut, fontSize = 12.sp, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
}
