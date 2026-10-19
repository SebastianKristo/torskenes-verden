package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 29 (ANDROID29): Innstillinger → KONTO → Backup (Mobil Papir App, claude-code-backup.md). Bare admin.
 * Seksjonene STATUS, AUTOMATISK, HVA SKAL TAS MED, HVOR og GJENOPPRETT. Logikken ligger i Backup29.kt.
 */

private fun <T> cyc29(l: List<Pair<String, T>>, cur: String): String = l[(l.indexOfFirst { it.first == cur } + 1).mod(l.size)].first

@Composable
internal fun Backup29Page(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.bk29
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { if (vm.userIsAdmin) vm.loadBk29() }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (!vm.userIsAdmin) {
            PLabel("Backup", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
            PCard { PRow("Backup av hele systemet", "Settes opp av en administrator", "Bare admin", serif = false) }
            return@Column
        }
        if (s.missing) {
            PLabel("Backup", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
            PCard { PRow("Backup av hele systemet", "Serveren har ikke systembackup ennå. Oppdater Homelab-serveren.", "Ikke tilgjengelig", serif = false) }
            return@Column
        }
        if (s.error.isNotBlank()) Text(s.error, color = p.lab, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp))
        val st = s.settings
        val last = s.last
        // 1. STATUS
        PLabel("Status", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        PCard {
            val lastSub = when {
                last != null -> listOf(bkWhen29(last.at), last.size, bkScopeName29(last.scope)).filter { it.isNotBlank() }.joinToString(" · ")
                !s.loaded -> if (s.loading) "Henter …" else "–"
                else -> "Ingen backup ennå"
            }
            PRow("Siste backup", lastSub, when { last == null -> ""; last.ok -> "✓ OK"; else -> "Feilet" }, valueColor = if (last?.ok != false) p.pos else p.lab, serif = false)
            if (last != null && !last.ok && last.error.isNotBlank()) Text(last.error, color = p.lab, fontSize = 12.5.sp, modifier = Modifier.padding(start = 14.dp, end = 14.dp, bottom = 10.dp))
            val pct = s.runPct
            if (pct != null) {
                PRow("Tar backup … $pct %", "Du kan lukke appen, den fortsetter i bakgrunnen", "", serif = false, top = true)
                Box(Modifier.padding(start = 14.dp, end = 14.dp, bottom = 12.dp).fillMaxWidth().height(4.dp).clip(CircleShape).background(p.line)) {
                    Box(Modifier.fillMaxWidth(pct / 100f).fillMaxHeight().background(p.lab))
                }
            } else PRow("Ta backup nå", bkScopeName29(st.scope), "Start ›", valueColor = p.lab, serif = false, top = true) { vm.runBk29() }
        }
        // 2. AUTOMATISK
        PLabel("Automatisk", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            PToggle("Automatisk backup", "Kjører i bakgrunnen på hjemmeserveren", st.auto) { vm.saveBk29(st.copy(auto = it)) }
            if (st.auto) {
                PRow("Hvor ofte", BK29_SCHEDULES.firstOrNull { it.first == st.schedule }?.second ?: st.schedule, "Endre ›", serif = false, top = true) {
                    vm.saveBk29(st.copy(schedule = cyc29(BK29_SCHEDULES, st.schedule)))
                }
                PRow("Behold", (BK29_KEEP.firstOrNull { it.first == st.keep }?.second ?: st.keep) + " · eldre slettes automatisk", "Endre ›", serif = false, top = true) {
                    vm.saveBk29(st.copy(keep = cyc29(BK29_KEEP, st.keep)))
                }
                PToggle("Varsle meg", "Når backup feiler (push og e-post)", st.notifyFail, top = true) { vm.saveBk29(st.copy(notifyFail = it)) }
            }
        }
        // 3. HVA SKAL TAS MED
        PLabel("Hva skal tas med", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            val scopeSub = when (st.scope) { "all" -> "Alle moduler, filer og innstillinger"; "finans" -> "Kun Finans-data og kvitteringer"; else -> "Velg moduler under" }
            PRow("Omfang", scopeSub, bkScopeName29(st.scope) + " ›", valueColor = p.ink, serif = false) { vm.saveBk29(st.copy(scope = cyc29(BK29_SCOPES, st.scope))) }
            BK29_MODULES.forEach { (k, n, sub) ->
                val inc = when (st.scope) { "all" -> true; "finans" -> k == "finans"; else -> k in st.modules }
                val click: (() -> Unit)? = if (st.scope == "custom") ({ vm.saveBk29(st.copy(modules = if (k in st.modules) st.modules - k else st.modules + k)) }) else null
                PRow(n, sub.ifBlank { null }, if (inc) "✓ Med" else "Ikke med", valueColor = if (inc) p.pos else p.mut, serif = false, top = true, onClick = click)
            }
        }
        if (st.scope != "custom") Text("Modulene kan bare endres i Egendefinert.", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
        // 4. HVOR
        PLabel("Hvor", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            PRow("Lagres på", "Homelab-disk · ${st.path}", "Lokal", serif = false)
            val prov = if (st.provider == "gdrive") "Google Drive" else "Backblaze B2"
            if (st.cloudSupported) PToggle("Kopi til sky", listOf("$prov · kryptert før opplasting", st.cloudStatus).filter { it.isNotBlank() }.joinToString(" · "), st.cloud, top = true) { vm.setBkCloud29(it) }
            else PRow("Kopi til sky", "$prov · kryptert før opplasting", "Kommer", serif = false, top = true)
            PToggle("Krypter backup", "AES-256 · nøkkel lagres hos deg" + if (st.keySet) "" else " (vises én gang)", st.encrypt, top = true) { vm.setBkEncrypt29(it) }
        }
        // 5. GJENOPPRETT
        PLabel("Gjenopprett", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            val items = s.list.take(10)
            if (items.isEmpty()) PRow("Ingen backups ennå", "Ta en backup først", "", serif = false)
            items.forEachIndexed { i, b ->
                PRow(bkWhen29(b.at).ifBlank { b.id }, listOf(b.size, bkScopeName29(b.scope), if (b.encrypted) "kryptert" else "", if (!b.ok) "feilet" else "").filter { it.isNotBlank() }.joinToString(" · "),
                    if (b.ok) "Gjenopprett ›" else "", valueColor = p.lab, serif = false, top = i > 0, onClick = if (b.ok) ({ vm.openRestore29(b) }) else null)
            }
            s.list.firstOrNull { it.ok }?.let { b ->
                PRow("Last ned siste backup", listOf(b.size, "åpnes i nettleseren").filter { it.isNotBlank() }.joinToString(" · "), "Last ned ›", valueColor = p.ink, serif = false, top = true) {
                    openCustomTab24(ctx, vm.bkDownloadUrl29(b))
                }
            }
        }
    }
    s.restore?.let { Restore29Dialog(vm, it) }
    s.newKey?.let { KeyDialog29(vm, it) }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun Restore29Dialog(vm: AppViewModel, b: Bk29Item) {
    val p = PaperPal.current
    val s = vm.bk29
    val mods = BK29_MODULES.filter { b.modules.isEmpty() || it.first in b.modules }
    AlertDialog(
        onDismissRequest = { if (!s.restoring) s.restore = null },
        containerColor = p.bg,
        title = { PSerif("Gjenopprett backup", 22.sp) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(listOf(bkWhen29(b.at), b.size, bkScopeName29(b.scope)).filter { it.isNotBlank() }.joinToString(" · "), color = p.mut, fontSize = 13.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Chip29("Alt i backupen", s.restoreAll) { s.restoreAll = true }
                    Chip29("Velg moduler", !s.restoreAll) { s.restoreAll = false }
                }
                if (!s.restoreAll) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    mods.forEach { (k, n, _) -> Chip29(n, k in s.restoreMods) { s.restoreMods = if (k in s.restoreMods) s.restoreMods - k else s.restoreMods + k } }
                }
                Text("Nåværende data i valgte moduler overskrives. Serveren tar automatisk en sikkerhetskopi først.", color = p.lab, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Box(Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, p.line, RoundedCornerShape(14.dp)).background(p.card).padding(horizontal = 14.dp),
                    contentAlignment = Alignment.CenterStart) {
                    if (s.restorePw.isEmpty()) Text("Passordet ditt", color = p.mut, fontSize = 15.sp)
                    BasicTextField(s.restorePw, { s.restorePw = it; s.restoreErr = "" }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontFamily = PaperFonts.sans), cursorBrush = SolidColor(p.ink), modifier = Modifier.fillMaxWidth())
                }
                if (s.restoreErr.isNotBlank()) Text(s.restoreErr, color = p.lab, fontSize = 13.sp)
            }
        },
        confirmButton = {
            TextButton(onClick = { vm.doRestore29() }, enabled = !s.restoring) {
                Text(if (s.restoring) "Gjenoppretter …" else "Gjenopprett", color = p.lab, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = { TextButton(onClick = { s.restore = null }, enabled = !s.restoring) { Text("Avbryt", color = p.ink) } },
    )
}

@Composable
private fun KeyDialog29(vm: AppViewModel, key: String) {
    val p = PaperPal.current
    val clip = LocalClipboardManager.current
    AlertDialog(
        onDismissRequest = {},
        containerColor = p.bg,
        title = { PSerif("Gjenopprettingsnøkkel", 22.sp) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Lagre nøkkelen et trygt sted (f.eks. passordbehandleren). Den vises bare denne ene gangen, og uten den kan krypterte backups ikke gjenopprettes andre steder.",
                    color = p.ink, fontSize = 14.sp)
                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.card).padding(12.dp)) {
                    Text(key, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 13.sp)
                }
            }
        },
        confirmButton = { TextButton(onClick = { vm.bk29.newKey = null }) { Text("Jeg har lagret den", color = p.lab, fontWeight = FontWeight.Bold) } },
        dismissButton = { TextButton(onClick = { clip.setText(AnnotatedString(key)); vm.flash("Nøkkelen er kopiert") }) { Text("Kopier", color = p.ink) } },
    )
}

@Composable
private fun Chip29(text: String, on: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(
        Modifier.height(34.dp).clip(CircleShape).border(1.dp, if (on) p.ink else p.line, CircleShape).background(if (on) p.ink else p.bg).press24(onClick = onClick).padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = if (on) p.bg else p.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.5.sp, maxLines = 1) }
}
