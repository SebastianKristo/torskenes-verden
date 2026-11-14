package no.kristo.finanshub.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import no.kristo.finanshub.*
import org.json.JSONObject

/*
 * Prompt 89 (AND89): Innstillinger → Varsler → Live Updates. Én bryter per aktivitet (GET/PUT /api/live/innstillinger, per bruker,
 * standard på). Backup vises bare for admin (serveren sender den aldri til andre). Endring → hent aktivitetene på nytt (Live89.kick).
 */
@Composable
internal fun Live89Section(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var st by remember(vm.account?.id) { mutableStateOf<Map<String, Boolean>?>(null) }
    var note by remember(vm.account?.id) { mutableStateOf<String?>(null) }
    LaunchedEffect(vm.account?.id) {
        if (vm.account == null) return@LaunchedEffect
        st = try { parseLiveSettings89(vm.api41 { hlGet("/live/innstillinger", timeout = 6_000) }) } catch (e: CancellationException) { throw e } catch (e: ApiException) {
            note = if (e.status == 404) "Serveren støtter ikke Live Updates ennå." else (e.message ?: "Fikk ikke hentet innstillingene"); null
        } catch (_: Exception) { note = "Fikk ikke hentet innstillingene"; null }
    }
    val types = Regel89.TYPES.filter { it != "backup" || vm.userIsAdmin }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Live Updates", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        val cur = st
        if (cur != null) PCard {
            types.forEachIndexed { i, t ->
                PToggle(Regel89.label(t), Regel89.about(t), cur[t] ?: true, top = i > 0) { v ->
                    val before = cur
                    st = cur + (t to v)
                    scope.launch {
                        val body = JSONObject().apply { (st ?: emptyMap()).forEach { (k, b) -> if (k != "backup" || vm.userIsAdmin) put(k, b) } }
                        try {
                            st = parseLiveSettings89(vm.api41 { hlPut("/live/innstillinger", body) })
                            Live89.kick(ctx)
                        } catch (e: CancellationException) { throw e } catch (e: Exception) { st = before; vm.message = "Fikk ikke lagret Live Updates" }
                    }
                }
            }
        }
        Text(note ?: "Vises som pågående varsel med fremdrift og knapper. På Android 16 også som brikke i statuslinja og på låseskjermen.",
            color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
    }
}
