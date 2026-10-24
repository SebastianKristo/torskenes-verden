package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import no.kristo.finanshub.*
import org.json.JSONArray
import org.json.JSONObject

/*
 * Prompt 45 – Media på mobil:
 *  - claude-code-media-tilbakeknapp.md: systemets tilbakeknapp (rund 40 dp glass-knapp med ‹) på alle undersider.
 *  - claude-code-media-mer-farger.md: tjenestefarger (Sonarr #35c5f4, Radarr #ffc230, qBittorrent #3d7dd6, Prowlarr #e66001, Plex #e5a00d,
 *    Jellyfin #aa5cc3) på aktiv fane og statusprikker; Papir-bakgrunnen beholdes.
 *  - claude-code-innstillinger-samlet.md: ⚙ i Media er borte; ⋯ har «Innstillinger for Media» som åpner Innstillinger → Media.
 *  - claude-code-media-slett-uovervakede-episoder.md: «Slett uovervåkede» (serie) og «Rydd uovervåkede» (alle) med bekreftelsesark,
 *    avkryssing per episode og Angre i 8 s (GET /api/media/unmonitored, POST …/delete, DELETE …/pending/:id).
 */

internal val MEDIA_COLORS45: Map<String, Long> = mapOf(
    "sonarr" to 0xFF35C5F4, "radarr" to 0xFFFFC230, "qbit" to 0xFF3D7DD6, "prowlarr" to 0xFFE66001, "plex" to 0xFFE5A00D, "jellyfin" to 0xFFAA5CC3,
    "spill" to 0xFFE5A00D, "snart" to 0xFFB23A2A,
)

/** Systemets tilbakeknapp: rund 40 dp glass-knapp med ‹ (treffflate 44 dp). */
@Composable
internal fun BackCircle45(label: String = "Tilbake", modifier: Modifier = Modifier, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(modifier.size(44.dp).clickable(role = Role.Button, onClickLabel = label) { Haptics.select(); onClick() }.semantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        Box(
            Modifier.size(40.dp).shadow(6.dp, CircleShape, ambientColor = Color.Black.copy(alpha = .2f), spotColor = Color.Black.copy(alpha = .2f))
                .clip(CircleShape).background(p.card.copy(alpha = .92f)).border(1.dp, p.line, CircleShape),
            contentAlignment = Alignment.Center,
        ) { WxIcon(IC_BACK30, p.ink, 18.dp, stroke = 2.4f) }
    }
}

/** Fanepille i tjenestens farge når den er valgt (ellers som Pill43). */
@Composable
internal fun MediaTab45(key: String, text: String, on: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    val c = MEDIA_COLORS45[key]?.let { Color(it) } ?: p.ink
    Row(Modifier.heightIn(min = 44.dp).clickable(role = Role.Tab, onClickLabel = text) { Haptics.select(); onClick() }, verticalAlignment = Alignment.CenterVertically) {
        Row(
            Modifier.height(36.dp).clip(CircleShape).background(if (on) c.copy(alpha = .16f) else p.card).border(1.5.dp, if (on) c else p.line, CircleShape).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(c))
            Text(text, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
        }
    }
}

/** ⋯ øverst i Media: Innstillinger for Media, og (admin) Rydd uovervåkede i Sonarr/Radarr. */
@Composable
internal fun MediaMenu45(vm: AppViewModel) {
    var open by remember { mutableStateOf(false) }
    val p = PaperPal.current
    Box {
        RoundBtn50("⋯", "Flere valg") { open = true } // prompt 50: rund 40 dp som ⋯ i Nyheter
        DropdownMenu(open, { open = false }, containerColor = p.card) {
            DropdownMenuItem({ Text("Innstillinger for Media", color = p.ink) }, {
                open = false; vm.closeMedia43(); vm.openPaperPage("set"); vm.settingsPage = "media"
            })
            if (vm.userIsAdmin) {
                DropdownMenuItem({ Text("Rydd uovervåkede episoder (Sonarr)", color = p.ink) }, { open = false; vm.openUnmon45("sonarr", null) })
                DropdownMenuItem({ Text("Rydd uovervåkede filmer (Radarr)", color = p.ink) }, { open = false; vm.openUnmon45("radarr", null) })
            }
        }
    }
}

/* ======================= Slett uovervåkede ======================= */

internal data class Unmon45(val fileId: String, val title: String, val code: String?, val series: String?, val sizeText: String?)

internal object UnmonState45 {
    var service by mutableStateOf<String?>(null)
    var seriesId by mutableStateOf<Int?>(null)
    var items by mutableStateOf<List<Unmon45>?>(null)
    var sel by mutableStateOf<Set<String>>(emptySet())
    var text by mutableStateOf<String?>(null)
    var error by mutableStateOf<String?>(null)
    var busy by mutableStateOf(false)
    var undo by mutableStateOf<String?>(null)
}

fun AppViewModel.openUnmon45(service: String, seriesId: Int?) {
    val u = UnmonState45
    u.service = service; u.seriesId = seriesId; u.items = null; u.sel = emptySet(); u.error = null; u.text = null
    launch45 {
        val q = "/media/unmonitored?service=$service" + (seriesId?.let { "&seriesId=$it" } ?: "")
        val raw = try { api45 { hlGet(mediaQ45(q), timeout = 20_000) } } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            u.error = if (e.status == 404) "Serveren kan ikke slette uovervåkede ennå. Oppdater Homelab." else (e.message ?: "Feil"); u.items = emptyList(); null
        } catch (e: Exception) { u.error = "Fikk ikke kontakt med serveren"; u.items = emptyList(); null } ?: return@launch45
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return@launch45
        val a = o.optJSONArray("items") ?: JSONArray()
        u.items = (0 until a.length()).mapNotNull { i ->
            val x = a.optJSONObject(i) ?: return@mapNotNull null
            val id = x.opt("fileId")?.toString()?.takeIf { it.isNotBlank() && it != "null" } ?: return@mapNotNull null
            Unmon45(id, x.optString("title"), x.optString("code").takeIf { it.isNotBlank() }, x.optString("series").takeIf { it.isNotBlank() }, x.optString("sizeText").takeIf { it.isNotBlank() })
        }
        u.sel = u.items.orEmpty().map { it.fileId }.toSet()
        u.text = o.optString("text").takeIf { it.isNotBlank() }
    }
}

/** Sonarr/Radarr bruker valgt server (?server=) som resten av Media. */
private fun AppViewModel.mediaQ45(path: String): String {
    val srv = p44.serverId ?: return path
    return path + "&server=" + java.net.URLEncoder.encode(srv, "UTF-8")
}

private fun AppViewModel.deleteUnmon45() {
    val u = UnmonState45
    val svc = u.service ?: return
    val ids = u.sel.toList()
    if (ids.isEmpty()) return
    u.busy = true
    launch45 {
        val body = JSONObject().put("service", svc).put("fileIds", JSONArray(ids.map { it.toIntOrNull() ?: it })).put("confirm", true).put("delaySec", 8)
        val raw = try { api45 { hlPost(mediaQ45("/media/unmonitored/delete?x=1"), body) } } catch (e: CancellationException) { throw e } catch (e: Exception) {
            u.busy = false; u.error = e.message ?: "Kunne ikke slette"; Haptics.error(); null
        } ?: return@launch45
        val o = runCatching { JSONObject(raw) }.getOrNull()
        u.busy = false
        u.service = null
        Haptics.success()
        p43.toast = o?.optString("message")?.takeIf { it.isNotBlank() } ?: "Sletter ${ids.size} filer …"
        u.undo = o?.optJSONObject("undo")?.optString("path")?.takeIf { it.isNotBlank() }
        delay(8_000)
        u.undo = null
        loadMedia43()
    }
}

private fun AppViewModel.undoUnmon45() {
    val path = UnmonState45.undo ?: return
    UnmonState45.undo = null
    launch45 {
        runCatching { api45 { request("DELETE", path.removePrefix("/api"), prefix = Api.HOMELAB) } }
            .onSuccess { p43.toast = "Angret – ingen filer ble slettet"; Haptics.success() }
            .onFailure { p43.toast = "For sent å angre" }
    }
}

/** Bekreftelsesarket: «Slette 12 episodefiler (8,4 GB) som ikke er overvåket?» med avkryssing per episode og «Slett filer». */
@Composable
internal fun UnmonSheet45(vm: AppViewModel) {
    val u = UnmonState45
    val p = PaperPal.current
    if (u.service != null) Sheet43({ u.service = null }) {
        PSerif(if (u.service == "radarr") "Slett uovervåkede filmer" else "Slett uovervåkede episoder", 22.sp)
        val items = u.items
        when {
            items == null -> Text("Finner filer som ikke er overvåket …", color = p.mut, fontSize = 13.sp)
            u.error != null -> Text(u.error!!, color = RED43, fontSize = 13.sp)
            items.isEmpty() -> Text("Ingen filer uten overvåking. Alt er ryddig.", color = p.mut, fontSize = 13.sp)
            else -> {
                Text(u.text ?: "Slette ${items.size} filer som ikke er overvåket?", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                Column(Modifier.fillMaxWidth().heightIn(max = 360.dp).verticalScroll(rememberScrollState()).clip(RoundedCornerShape(14.dp)).background(p.card)) {
                    items.forEachIndexed { i, x ->
                        if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                        val on = x.fileId in u.sel
                        Row(
                            Modifier.fillMaxWidth().clickable(role = Role.Checkbox) { Haptics.select(); u.sel = if (on) u.sel - x.fileId else u.sel + x.fileId }.padding(12.dp, 10.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Box(Modifier.size(22.dp).clip(RoundedCornerShape(6.dp)).background(if (on) RED43 else Color.Transparent).border(1.5.dp, if (on) RED43 else p.line, RoundedCornerShape(6.dp)),
                                contentAlignment = Alignment.Center) { if (on) Text("✓", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
                            Column(Modifier.weight(1f)) {
                                Text(listOfNotNull(x.code, x.title.ifBlank { null }).joinToString(" · "), color = p.ink, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                x.series?.let { Text(it, color = p.mut, fontSize = 12.sp, maxLines = 1) }
                            }
                            x.sizeText?.let { Text(it, color = p.mut, fontSize = 12.sp) }
                        }
                    }
                }
                Btn43(if (u.busy) "Sletter …" else "Slett filer (${u.sel.size})", color = RED43, modifier = Modifier.fillMaxWidth(), enabled = !u.busy && u.sel.isNotEmpty()) { vm.deleteUnmon45() }
                Text("Filene slettes fra disken etter 8 sekunder. Du kan angre til da.", color = p.mut, fontSize = 12.sp)
            }
        }
    }
    if (u.undo != null) Box(Modifier.fillMaxSize().navigationBarsPadding().padding(bottom = 70.dp), contentAlignment = Alignment.BottomCenter) {
        Row(Modifier.clip(RoundedCornerShape(14.dp)).background(p.ink).padding(start = 14.dp, end = 6.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Sletter uovervåkede filer …", color = p.bg, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.width(10.dp))
            Box(Modifier.height(34.dp).clip(CircleShape).background(p.bg).clickable(role = Role.Button) { vm.undoUnmon45() }.padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                Text("Angre", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            }
        }
    }
}

/* ======================= Innstillinger → Media ======================= */

/** Innstillinger → Media (flyttet fra ⚙ i Media): status per tjeneste fra serveren og lenke til Integrasjoner. */
@Composable
internal fun MediaSettings45(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p43
    LaunchedEffect(Unit) { vm.loadStatus43() }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Tjenestenøklene ligger bare på serveren. Appen snakker med Homelab, som er proxy til tjenestene.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp))
        PCard {
            if (s.services.isEmpty()) Text(if (s.missing) "Media er ikke på serveren ennå." else "Henter status …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
            s.services.forEachIndexed { i, x ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                val integ = vm.integOk44(x.key)
                val conf = x.configured || integ == true
                Row(Modifier.fillMaxWidth().padding(14.dp, 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(MEDIA_COLORS45[x.key]?.let { Color(it) } ?: p.mut))
                    Column(Modifier.weight(1f)) {
                        Text(x.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(if (!conf) "Ikke satt opp · Integrasjoner → MEDIA" else if (!x.configured) "Koblet til (Integrasjoner)" else listOfNotNull(x.version?.let { "v$it" }, x.ms?.let { "$it ms" }, x.error?.let { "Svarer ikke: $it" }).joinToString(" · "),
                            color = if (x.error != null) RED43 else p.mut, fontSize = 12.sp)
                    }
                    Box(Modifier.size(9.dp).clip(CircleShape).background(if (!conf) p.line else if (x.ok || (!x.configured && integ == true)) OK43 else RED43))
                }
            }
        }
        PButton("Integrasjoner …", Modifier.fillMaxWidth(), kind = "line") { vm.settingsPage = "integ" }
        if (vm.userIsAdmin) PButton("Rydd uovervåkede episoder", Modifier.fillMaxWidth(), kind = "line") { vm.p43.mediaOpen = true; vm.openUnmon45("sonarr", null) }
    }
}
