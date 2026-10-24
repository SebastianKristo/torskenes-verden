package no.kristo.finanshub.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Prompt 44 – Innstillinger og fullskjermsider (fasit Mobil Papir App.dc.html, Rediger Andres Oppsett.dc.html, Tidligere Versjoner.dc.html,
 * Logger.dc.html, Studie Dokumenter.dc.html):
 *  - Kontoer og brukere → FAMILIE · LOGG INN SOM (bare admin) og SERVER · EIER (Overfør eierskap i to steg).
 *  - Stripa «Logget inn som X · Gå ut» øverst over hele appen mens admin er logget inn som en annen.
 *  - System → TIDLIGERE VERSJONER (10 siste, Installer → ark med Behold data / Gjenopprett backup, pause 7 dager, passord).
 *  - Logger: containere, filter, mørkt loggvindu (én kolonne), Glimt forklarer, feil gruppert, Start på nytt / Stopp (admin, bekreftelse).
 *  - Studie → Dokumenter: last opp vitnemål/karakterutskrift, Glimt-steg, emnetabell, «Glimt fant», spør, Legg emner i Studie.
 */

private val RED44u = Color(0xFFB23A2A)
private val GREEN44u = Color(0xFF2F6B4A)
private val YEL44u = Color(0xFFA0671A)

/* ---------------- Kontoer og brukere ---------------- */

@Composable
internal fun Accounts44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    if (!vm.userIsAdmin || vm.impersonating44) return
    LaunchedEffect(vm.account?.id) { vm.loadAsUsers44(); vm.loadOwner44() }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Familie · logg inn som", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            val us = t.asUsers
            if (us == null) Text("Henter brukere …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
            else if (us.isEmpty()) Text("Ingen andre brukere på serveren.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
            us.orEmpty().forEachIndexed { i, u ->
                PRow(u.name, listOfNotNull(roleNo44(u.role), u.device, if (u.locked) "låst oppsett" else "kan endre selv").joinToString(" · "), "›", top = i > 0) { t.asSheet = u }
            }
        }
        Text("Logg inn som et familiemedlem for å rydde i Hjem, fanelinja og Mer. Uten passord, fordi du er admin. Gå ut når du er ferdig.",
            color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
        PLabel("Server · eier", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            val o = t.owner
            PRow("Eier av serveren", o?.let { it.name + (if (it.me) " (deg)" else "") + (it.since?.let { s -> " · startet serveren ${s.take(10)}" } ?: "") } ?: "Henter …", "", serif = false)
            o?.pending?.let { PRow("Venter på godkjenning", it, "", serif = false, top = true) }
            if (o?.canTransfer != false) PRow("Overfør eierskap", "Velg ny eier · krever bekreftelse", "›", RED44u, serif = false, top = true) {
                t.ownSheet = true; t.ownStep = 0; t.ownPick = null; t.ownErr = null
            }
        }
    }
    t.asSheet?.let { AsSheet44(vm, it) }
    if (t.ownSheet) OwnSheet44(vm)
}

private fun roleNo44(r: String?) = when (r) { "admin" -> "Admin"; "owner", "eier" -> "Eier"; null, "" -> null; "user", "bruker" -> "Bruker"; else -> r.replaceFirstChar { it.uppercase() } }

@Composable
private fun AsSheet44(vm: AppViewModel, u: AsUser44) {
    val p = PaperPal.current
    val t = vm.p44
    Sheet43({ t.asSheet = null }) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(54.dp).clip(CircleShape).background(u.color?.let { Color(it) } ?: p.ink), contentAlignment = Alignment.Center) {
                Text(u.name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 22.sp)
            }
            Column { PSerif(u.name, 24.sp, maxLines = 1); Text(listOfNotNull(roleNo44(u.role), u.device).joinToString(" · "), color = p.mut, fontSize = 13.sp) }
        }
        Btn43(if (t.asBusy) "Logger inn …" else "Logg inn som ${firstName37(u.name)}", color = RED44u, modifier = Modifier.fillMaxWidth(), enabled = !t.asBusy) { vm.loginAs44(u) }
        Text("Uten passord, fordi du er admin. Appen lastes på nytt som ${firstName37(u.name)}. Endringer lagres på ${firstName37(u.name)} sin konto. " +
            "Chat, Finans og Helse er skrivebeskyttet, og passord, 2FA og rolle kan ikke endres. Trykk «Gå ut» øverst når du er ferdig.", color = p.mut, fontSize = 12.5.sp, lineHeight = 18.sp)
        var ask by remember(u.id) { mutableStateOf<String?>(null) }
        PCard {
            PRow("Kopier mitt oppsett hit", "Hjem, fanelinje og Mer", "›", serif = false) { ask = "copy-from-me" }
            PRow("Tilbakestill til standard", null, "›", serif = false, top = true) { ask = "reset" }
            PToggle("${firstName37(u.name)} kan endre selv", if (u.locked) "Av: oppsettet styres av deg" else "Wiggle-redigering er på hos ${firstName37(u.name)}", !u.locked, top = true) { on -> vm.layoutAct44(u, "lock", locked = !on) }
        }
        ask?.let { a ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn43(if (a == "reset") "Tilbakestill" else "Kopier", color = RED44u) { ask = null; vm.layoutAct44(u, a) }
                Btn43("Avbryt") { ask = null }
            }
        }
    }
}

@Composable
private fun OwnSheet44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    var typed by remember { mutableStateOf("") }
    var pw by remember { mutableStateOf("") }
    Sheet43({ t.ownSheet = false }) {
        PSerif("Overfør eierskap", 24.sp)
        if (t.ownStep == 0) {
            Text("Den nye eieren får ansvaret for serveren: backup-nøkkel, varsler om serverfeil og kontoer som er koblet til eierkontoen. Du blir admin.",
                color = p.mut, fontSize = 13.sp, lineHeight = 18.sp)
            (t.ownCands ?: t.asUsers).orEmpty().forEach { u ->
                val on = t.ownPick?.id == u.id
                val why = if (t.ownCands != null) u.device else null // grunnen til at personen ikke kan bli eier (f.eks. 2FA mangler)
                Row(Modifier.fillMaxWidth().heightIn(min = 54.dp).clip(RoundedCornerShape(14.dp)).background(if (on) p.ink else p.card).clickable(enabled = why == null) { t.ownPick = u }.padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(32.dp).clip(CircleShape).background(u.color?.let { Color(it) } ?: p.mut), contentAlignment = Alignment.Center) {
                        Text(u.name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(u.name, color = if (on) p.bg else if (why != null) p.mut else p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        why?.let { Text(it, color = RED44u, fontSize = 11.5.sp) }
                    }
                    roleNo44(u.role)?.let { Text(it, color = if (on) p.bg else p.mut, fontSize = 12.sp) }
                }
            }
            Btn43("Fortsett", dark = true, modifier = Modifier.fillMaxWidth(), enabled = t.ownPick != null) { t.ownStep = 1; typed = "" }
        } else {
            val u = t.ownPick ?: run { t.ownStep = 0; return@Sheet43 }
            Text("Skriv navnet til ${u.name} for å bekrefte, og passordet ditt.", color = p.mut, fontSize = 13.sp)
            Field43(typed, u.name) { typed = it }
            Field43(pw, "Passordet ditt", password = true) { pw = it }
            t.ownErr?.let { Text(it, color = RED44u, fontSize = 13.sp) }
            val ok = typed.trim().equals(u.name.trim(), ignoreCase = true)
            Btn43(if (t.ownBusy) "Overfører …" else "Overfør til ${firstName37(u.name)}", color = if (ok) RED44u else p.line, modifier = Modifier.fillMaxWidth(), enabled = ok && !t.ownBusy) {
                vm.transferOwner44(u, pw)
            }
            Btn43("Tilbake", modifier = Modifier.fillMaxWidth()) { t.ownStep = 0 }
            Text("Kan ikke angres i appen. Den nye eieren kan overføre tilbake.", color = p.mut, fontSize = 12.sp)
        }
    }
}

/** Fast stripe øverst: «Logget inn som X · Gå ut». */
@Composable
internal fun AsStripe44(vm: AppViewModel, modifier: Modifier) {
    val t = vm.p44
    if (!vm.impersonating44) return
    val name = t.asName ?: vm.account?.name ?: ""
    val c = t.asColor?.let { Color(it) } ?: Color(0xFF6B3F6E)
    Row(modifier.statusBarsPadding().padding(top = 4.dp).clip(CircleShape).background(c).padding(start = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("Logget inn som ${firstName37(name)}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
        Text("Gå ut", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, modifier = Modifier.padding(start = 8.dp).heightIn(min = 40.dp).clip(CircleShape)
            .background(Color.White.copy(alpha = .18f)).clickable(role = Role.Button) { vm.exitAs44() }.padding(horizontal = 12.dp).wrapContentHeight())
    }
}

/* ---------------- Tidligere versjoner ---------------- */

@Composable
internal fun Rollback44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    LaunchedEffect(Unit) { vm.loadVersions44() }
    if (t.verMissing) return
    var all by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("TIDLIGERE VERSJONER", color = p.lab, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.2.sp)
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.lab.copy(alpha = .4f)))
        t.verMsg?.let { Text(it, color = GREEN44u, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
        val list = t.versions
        if (list == null) Text("Henter versjoner …", color = p.mut, fontSize = 13.sp)
        else if (list.isEmpty()) Text("Updateren har ingen tidligere versjoner lagret ennå.", color = p.mut, fontSize = 13.sp)
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(p.card)) {
            list.orEmpty().take(if (all) 10 else 4).forEachIndexed { i, v ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(v.version, color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            if (v.previous) Tag44("Forrige", p.ink)
                            if (v.hasBackup) Tag44("Har backup", GREEN44u)
                        }
                        Text(listOfNotNull(v.date?.take(10), v.notes).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (v.current) Text("Kjører nå", color = GREEN44u, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                    else Text("Installer", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape)
                        .border(1.dp, p.line, CircleShape).clickable(role = Role.Button) { t.verSheet = v; t.verErr = null }.padding(horizontal = 14.dp).wrapContentHeight())
                }
            }
        }
        if (!all && list.orEmpty().size > 4) Text("Vis alle ${list.orEmpty().size}", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 13.sp,
            modifier = Modifier.heightIn(min = 44.dp).clickable { all = true }.wrapContentHeight())
        Text("Tilbakerulling bruker updater-containeren, med backup før og automatisk tilbake ved feil innen 90 s. «Krev passord» gjelder også her.",
            color = p.mut, fontSize = 12.sp, lineHeight = 17.sp)
    }
    t.verSheet?.let { VerSheet44(vm, it) }
}

@Composable
private fun Tag44(text: String, c: Color) {
    Text(text, color = c, fontWeight = FontWeight.Bold, fontSize = 10.5.sp, modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(c.copy(alpha = .12f)).padding(horizontal = 6.dp, vertical = 2.dp))
}

@Composable
private fun VerSheet44(vm: AppViewModel, v: Ver44) {
    val p = PaperPal.current
    val t = vm.p44
    var restore by remember(v.version) { mutableStateOf(!v.compatible && v.hasBackup) }
    var pause by remember(v.version) { mutableStateOf(true) }
    var pw by remember { mutableStateOf("") }
    Sheet43({ t.verSheet = null }) {
        PSerif("Gå tilbake til Nordlys ${v.version}?", 24.sp)
        Radio44("Behold dataene mine", if (v.compatible) "Bare koden byttes." else "Databasen ble endret etter ${v.version}. Du må gjenopprette backupen.", !restore, v.compatible) { restore = false }
        Radio44("Gjenopprett backup" + (v.backupAt?.let { " fra ${it.take(16).replace('T', ' ')}" } ?: ""),
            "Data tilbake til slik de var før oppdateringen. Endringer etter det forsvinner.", restore, v.hasBackup) { restore = true }
        Toggle43("Slå av automatiske oppdateringer i 7 dager", "Så den ikke oppdaterer seg rett tilbake", pause) { pause = it }
        Field43(pw, "Passord (når «Krev passord» er på)", password = true) { pw = it }
        t.verErr?.let { Text(it, color = RED44u, fontSize = 13.sp) }
        Btn43(if (t.verBusy) "Starter …" else "Installer ${v.version}", color = RED44u, modifier = Modifier.fillMaxWidth(), enabled = !t.verBusy && (v.compatible || restore)) {
            vm.rollback44(v, restore, pause, pw)
        }
    }
}

@Composable
private fun Radio44(title: String, sub: String, on: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).clickable(enabled = enabled, role = Role.RadioButton) { onClick() }.padding(14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(20.dp).clip(CircleShape).border(2.dp, if (enabled) p.ink else p.line, CircleShape), contentAlignment = Alignment.Center) {
            if (on) Box(Modifier.size(10.dp).clip(CircleShape).background(p.ink))
        }
        Column(Modifier.weight(1f)) {
            Text(title, color = if (enabled) p.ink else p.mut, fontWeight = FontWeight.Bold, fontSize = 14.5.sp)
            Text(sub, color = p.mut, fontSize = 12.sp, lineHeight = 16.sp)
        }
    }
}

/* ---------------- Logger ---------------- */

private val LOG_BG44 = Color(0xFF15171A)

@Composable
internal fun LoggerScreen44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    val ctx = LocalContext.current
    BackHandler { if (t.logPick != null) t.logPick = null else t.logsOpen = false }
    LaunchedEffect(t.ct, t.logLevel, t.logSince) { vm.loadLogs44() }
    LaunchedEffect(t.logQ) { delay(400); vm.loadLogs44() }
    LaunchedEffect(t.live) { while (t.live) { delay(3000); vm.loadLogs44() } }
    val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val listState = rememberLazyListState()
    LaunchedEffect(t.logs?.size, t.live) { if (t.live) t.logs?.size?.takeIf { it > 0 }?.let { runCatching { listState.scrollToItem(it - 1) } } }
    Column(Modifier.fillMaxSize().background(p.bg).statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 12.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("‹ Tilbake", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape)
                .clickable { t.logsOpen = false }.padding(horizontal = 10.dp).wrapContentHeight())
        }
        PSerif("Logger", 34.sp, modifier = Modifier.padding(start = 18.dp, bottom = 2.dp))
        Text("Docker-logger, feil og feilsøking", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(start = 18.dp, bottom = 8.dp))
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = listState, contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, 24.dp + navB), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (t.logsMissing) item { Text("Logger finnes ikke på serveren ennå. Oppdater Homelab.", color = p.mut, fontSize = 13.sp) }
            t.logsErr?.let { e -> item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(e, color = RED44u, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Text("Oppsett: monter /var/run/docker.sock (helst via tecnativa/docker-socket-proxy med CONTAINERS=1 LOGS=1 POST=1) i homelab-containeren.", color = p.mut, fontSize = 12.sp)
                }
            } }
            // Tall øverst.
            t.cts?.let { cs -> item {
                val up = cs.count { it.state == "running" }
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Kpi44("Oppe", "$up/${cs.size}", if (up == cs.size) GREEN44u else RED44u)
                    Kpi44("Feil", "${cs.sumOf { it.errors }}", if (cs.sumOf { it.errors } > 0) RED44u else p.ink)
                    Kpi44("Omstarter", "${cs.sumOf { it.restarts }}" + (cs.maxByOrNull { it.restarts }?.takeIf { it.restarts > 0 }?.let { " · ${it.name}" } ?: ""), p.ink)
                }
            } }
            // Containere.
            item {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Pill43("Alle", t.ct == null) { t.ct = null }
                    t.cts.orEmpty().forEach { c ->
                        val dot = when { c.state == "running" -> "●"; c.state.contains("restart") -> "◐"; else -> "○" }
                        Pill43("$dot ${c.name}", t.ct == c.name, c.errors.takeIf { it > 0 }) { t.ct = c.name }
                    }
                }
            }
            t.cts?.firstOrNull { it.name == t.ct }?.let { c -> item { CtCard44(vm, c) } }
            // Filter.
            item { Field43(t.logQ, "Søk i loggene") { t.logQ = it } }
            item {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("alle" to "Alle", "info" to "Info+", "warn" to "Advarsler", "error" to "Feil").forEach { (k, n) -> Pill43(n, t.logLevel == k) { t.logLevel = k } }
                    Spacer(Modifier.width(6.dp))
                    listOf("15m" to "15m", "1h" to "1t", "24h" to "24t", "7d" to "7d").forEach { (k, n) -> Pill43(n, t.logSince == k) { t.logSince = k } }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Btn43(if (t.live) "● Live" else "Live", color = if (t.live) RED44u else null) { t.live = !t.live }
                    Btn43("Last ned") { shareLog44(ctx, t.logs.orEmpty().joinToString("\n") { "${it.t} ${it.level.uppercase()} [${it.ct}] ${it.msg}" }) }
                }
            }
            // Loggvindu (mørkt, mono).
            val logs = t.logs
            if (logs == null && !t.logsMissing && t.logsErr == null) item { Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
            if (logs != null) item {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(LOG_BG44).padding(vertical = 6.dp)) {
                    if (logs.isEmpty()) Text("Ingen linjer for filteret.", color = Color(0xFF9AA0A6), fontFamily = PaperFonts.mono, fontSize = 12.sp, modifier = Modifier.padding(12.dp))
                    logs.forEach { l -> LogLine44(l) { vm.explain44(l) } }
                }
            }
            // Feil gruppert.
            t.groups?.takeIf { it.isNotEmpty() }?.let { gs -> item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PLabel("Feil gruppert · 24 t", modifier = Modifier.padding(top = 6.dp))
                    gs.forEach { g ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).clickable { vm.explain44(Log44(g.last ?: "", "error", g.ct, g.msg)) }.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("×${g.count}", color = RED44u, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            Column(Modifier.weight(1f)) {
                                Text(g.msg, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text(listOfNotNull(g.ct, g.last?.take(16)?.replace('T', ' ')?.let { "sist $it" }).joinToString(" · "), color = p.mut, fontSize = 11.5.sp)
                            }
                            Text("Forklar ›", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                }
            } }
        }
    }
    t.logPick?.let { LogDetail44(vm, it) }
    t.ctAsk?.let { (id, act) ->
        Sheet43({ t.ctAsk = null }) {
            PSerif(if (act == "stop") "Stoppe containeren?" else "Starte på nytt?", 22.sp)
            Text("Gjelder ${t.cts.orEmpty().firstOrNull { it.id == id }?.name ?: id}. Tjenesten er borte en liten stund.", color = p.mut, fontSize = 13.sp)
            Btn43(if (act == "stop") "Stopp" else "Start på nytt", color = RED44u, modifier = Modifier.fillMaxWidth()) { vm.ctAction44(id, act) }
        }
    }
}

@Composable
private fun Kpi44(label: String, value: String, c: Color) {
    val p = PaperPal.current
    Column(Modifier.widthIn(min = 104.dp).clip(RoundedCornerShape(16.dp)).background(p.card).padding(12.dp)) {
        PLabel(label, color = p.mut)
        Text(value, color = c, fontFamily = PaperFonts.serif, fontSize = 24.sp, maxLines = 1)
    }
}

@Composable
private fun CtCard44(vm: AppViewModel, c: Ct44) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(c.name, color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        Text(listOfNotNull(c.image, c.state, c.uptime, c.cpu?.let { "CPU $it" }, c.mem?.let { "minne $it" }, "${c.restarts} omstarter").joinToString(" · "),
            color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp)
        if (vm.userIsAdmin) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn43("Start på nytt", dark = true) { vm.p44.ctAsk = c.id to "restart" }
            if (c.state == "running") Btn43("Stopp", color = RED44u) { vm.p44.ctAsk = c.id to "stop" } else Btn43("Start") { vm.ctAction44(c.id, "start") }
        }
    }
}

@Composable
private fun LogLine44(l: Log44, onClick: () -> Unit) {
    val err = l.level.startsWith("err") || l.level == "fatal"
    val c = when { err -> Color(0xFFFF7B72); l.level.startsWith("warn") -> Color(0xFFE3B341); l.level == "debug" -> Color(0xFF8B949E); else -> Color(0xFF7EE787) }
    Column(Modifier.fillMaxWidth().background(if (err) Color(0x33FF4D4D) else Color.Transparent).clickable(onClick = onClick).padding(horizontal = 10.dp, vertical = 4.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(l.t.takeLast(12).take(8), color = Color(0xFF8B949E), fontFamily = PaperFonts.mono, fontSize = 10.5.sp)
            Text(l.level.uppercase().take(5), color = c, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 10.5.sp)
            Text(l.ct, color = Color(0xFF79C0FF), fontFamily = PaperFonts.mono, fontSize = 10.5.sp, maxLines = 1)
        }
        Text(l.msg, color = Color(0xFFE6EDF3), fontFamily = PaperFonts.mono, fontSize = 11.5.sp, lineHeight = 15.sp, maxLines = 4, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun LogDetail44(vm: AppViewModel, l: Log44) {
    val p = PaperPal.current
    val t = vm.p44
    val ctx = LocalContext.current
    Sheet43({ t.logPick = null }) {
        PLabel("${l.level.uppercase()} · ${l.ct}")
        Text(l.msg, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 12.5.sp, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(p.card).padding(12.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) { GlimtFig35("glimt", 30.dp, if (t.explainBusy) "talk" else "idle"); Text("  Glimt forklarer", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
            Text(t.explain ?: "Glimt leser linjen …", color = p.ink, fontSize = 14.sp, lineHeight = 20.sp)
        }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn43("Kopier med 20 linjer rundt") {
                (ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.setPrimaryClip(ClipData.newPlainText("Logg", vm.logContext44(l)))
                vm.flash("Kopiert")
            }
            Btn43("Vis i sammenheng") { t.logPick = null; t.ct = l.ct; t.logLevel = "alle"; t.logQ = "" }
        }
    }
}

private fun shareLog44(ctx: Context, text: String) {
    runCatching {
        ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text).putExtra(Intent.EXTRA_SUBJECT, "homelab.log"), "Last ned logg")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/* ---------------- Studie → Dokumenter ---------------- */

@Composable
internal fun StudyScreen44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    val ctx = LocalContext.current
    BackHandler { if (t.doc != null) t.doc = null else t.studyOpen = false }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        uris.forEach { u ->
            val cr = ctx.contentResolver
            val data = runCatching { cr.openInputStream(u)?.use { it.readBytes() } }.getOrNull() ?: return@forEach
            val mime = cr.getType(u) ?: "application/octet-stream"
            val name = "dokument" + if (mime.contains("pdf")) ".pdf" else if (mime.contains("png")) ".png" else if (mime.contains("heic")) ".heic" else ".jpg"
            vm.uploadDoc44(name, mime, data)
        }
    }
    val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Column(Modifier.fillMaxSize().background(p.bg).statusBarsPadding()) {
        // Prompt 50 (claude-code-studie-topp-som-nyheter.md): topplinje som i Nyheter og Media – «‹ Tilbake»-pille, kicker + tittel
        // på samme rad, ✦ Glimt (velg dokument som Glimt leser) og ⋯ til høyre. Undertekst rett under raden; ingen egen stor tittel.
        val d0 = t.doc
        var menu50 by remember { mutableStateOf(false) }
        NewsTop50(
            if (d0 == null) "Studie · Dokumenter" else "Studie · Dokument", d0?.title ?: "Dokumenter",
            Modifier.padding(start = 16.dp, end = 12.dp, top = 8.dp), onBack = { if (t.doc != null) t.doc = null else t.studyOpen = false },
        ) {
            RoundBtn50("✦", "Glimt leser et dokument") { if (!t.docBusy) pick.launch(arrayOf("application/pdf", "image/*")) }
            Box {
                RoundBtn50("⋯", "Flere valg") { menu50 = true }
                androidx.compose.material3.DropdownMenu(menu50, { menu50 = false }, containerColor = p.card) {
                    androidx.compose.material3.DropdownMenuItem({ Text("Last opp dokument", color = p.ink) }, { menu50 = false; pick.launch(arrayOf("application/pdf", "image/*")) })
                    androidx.compose.material3.DropdownMenuItem({ Text("Hent listen på nytt", color = p.ink) }, { menu50 = false; vm.loadDocs44() })
                }
            }
        }
        Text(
            if (d0 == null) "Vitnemål, karakterutskrift og attester · Glimt leser og regner ut"
            else listOfNotNull(kindNo44(d0.kind), d0.institution, d0.date?.take(10)).joinToString(" · ").ifBlank { "Glimt leser og regner ut" },
            color = p.mut, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 2.dp, bottom = 12.dp),
        )
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, 24.dp + navB), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val d = t.doc
            if (d == null) {
                item {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).border(1.5.dp, p.line, RoundedCornerShape(18.dp)).padding(18.dp),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Vitnemål, karakterutskrift, attest eller kursbevis", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text("PDF, JPG, PNG eller HEIC · flere om gangen. Glimt leser og regner ut snitt og studiepoeng på hjemmeserveren.", color = p.mut, fontSize = 12.5.sp)
                        Btn43(if (t.docBusy) "Glimt leser …" else "Velg fil", dark = true, enabled = !t.docBusy) { pick.launch(arrayOf("application/pdf", "image/*")) }
                    }
                }
                if (t.docSteps.isNotEmpty()) item { Steps44(t.docSteps, t.docBusy) }
                t.docErr?.let { e -> item { Text(e, color = RED44u, fontSize = 13.sp) } }
                if (t.docsMissing) item { Text("Studie-dokumenter finnes ikke på serveren ennå. Oppdater Homelab.", color = p.mut, fontSize = 13.sp) }
                val ds = t.docs
                if (ds == null) item { Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
                else {
                    val sp = ds.sumOf { it.sp ?: 0.0 }
                    if (ds.isNotEmpty()) item {
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Kpi44("Studiepoeng", if (sp > 0) "%.0f".format(sp) else "–", p.ink)
                            Kpi44("Snitt", ds.firstNotNullOfOrNull { it.snitt } ?: "–", p.ink)
                            Kpi44("Dokumenter", "${ds.size}", p.ink)
                        }
                    }
                    if (ds.isEmpty() && !t.docsMissing) item { Text("Ingen dokumenter ennå.", color = p.mut, fontSize = 13.sp) }
                    ds.forEach { x ->
                        item(key = "doc-" + x.id) {
                            PCard(onClick = { t.doc = x; t.docAnswer = null }) {
                                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    PSerif(x.title, 18.sp, maxLines = 1)
                                    Text(listOfNotNull(kindNo44(x.kind), x.institution, x.date?.take(10), "${x.emner.size} emner", x.snitt?.let { "snitt $it" }).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 2)
                                }
                            }
                        }
                    }
                }
            } else {
                item { DocView44(vm, d) }
            }
        }
    }
}

private fun kindNo44(k: String?) = when (k) { "vitnemal", "vitnemål", "diploma" -> "Vitnemål"; "karakterutskrift", "transcript" -> "Karakterutskrift"; "attest" -> "Attest"; "kursbevis", "course" -> "Kursbevis"; null -> null; else -> k.replaceFirstChar { it.uppercase() } }

@Composable
private fun Steps44(steps: List<String>, busy: Boolean) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        steps.forEach { Text("✓ $it", color = p.ink, fontSize = 13.sp) }
        if (busy) Row(verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(color = p.ink, strokeWidth = 2.dp, modifier = Modifier.size(14.dp)); Text("  Glimt leser fag og karakterer …", color = p.mut, fontSize = 13.sp) }
    }
}

private fun gradeColor44(g: String?): Color? {
    val k = g?.trim()?.uppercase() ?: return null
    return when (k) { "A", "B", "5", "6" -> GREEN44u; "D", "3" -> YEL44u; "E", "F", "1", "2" -> RED44u; else -> null }
}

@Composable
private fun DocView44(vm: AppViewModel, d: SDoc44) {
    val p = PaperPal.current
    var q by remember(d.id) { mutableStateOf("") }
    var del by remember(d.id) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // Prompt 50: «type · institusjon · dato» står nå som undertekst under topplinja.
        d.summary?.let { Text(it, color = p.ink, fontSize = 14.sp, lineHeight = 20.sp) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Kpi44("Snitt", d.snitt ?: "–", p.ink)
            Kpi44("Studiepoeng", d.sp?.let { "%.0f".format(it) } ?: "%.0f".format(d.emner.sumOf { it.sp ?: 0.0 }), p.ink)
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(12.dp)) {
            Row { listOf("KODE" to .9f, "EMNE" to 2.2f, "SP" to .5f, "KAR." to .6f).forEach { (h, w) -> Text(h, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 10.5.sp, modifier = Modifier.weight(w)) } }
            d.emner.forEach { e ->
                Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(e.kode, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, modifier = Modifier.weight(.9f), maxLines = 1)
                    Text(e.navn, color = p.ink, fontSize = 13.sp, modifier = Modifier.weight(2.2f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(e.sp?.let { if (it % 1.0 == 0.0) "%.0f".format(it) else "%.1f".format(it) } ?: "", color = p.ink, fontSize = 12.5.sp, modifier = Modifier.weight(.5f))
                    Text(e.karakter ?: "", color = gradeColor44(e.karakter) ?: p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.weight(.6f))
                }
            }
        }
        if (d.found.isNotEmpty()) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            PLabel("Glimt fant")
            d.found.forEach { Text("• $it", color = p.ink, fontSize = 13.5.sp) }
        }
        Field43(q, "Spør om dokumentet: «har jeg strøk?»", onDone = { vm.askDoc44(d, q) }) { q = it }
        vm.p44.docAnswer?.let { Text(it, color = p.ink, fontSize = 14.sp, lineHeight = 20.sp) }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn43("Legg emner i Studie", dark = true, enabled = d.emner.isNotEmpty()) { vm.applyDoc44(d) }
            Btn43("Slett", color = RED44u) { del = true }
        }
        if (del) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn43("Slett dokumentet, teksten og søkedata", color = RED44u) { vm.deleteDoc44(d) }
            Btn43("Avbryt") { del = false }
        }
    }
}

/* ---------------- Felles lag ---------------- */

/** Over hele appen: stripa for «Logg inn som», toasten etter «Gå ut», Logger og Studie-dokumenter. */
@Composable
internal fun BoxScope.Global44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    if (t.logsOpen) LoggerScreen44(vm)
    if (t.studyOpen) StudyScreen44(vm)
    AsStripe44(vm, Modifier.align(Alignment.TopCenter))
    t.asToast?.let { msg ->
        LaunchedEffect(msg) { delay(4500); t.asToast = null }
        val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        Row(Modifier.align(Alignment.BottomCenter).padding(bottom = navB + 96.dp, start = 16.dp, end = 16.dp).clip(RoundedCornerShape(14.dp)).background(p.ink).padding(start = 14.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Text(msg, color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.weight(1f, fill = false).padding(vertical = 10.dp))
            if (t.asUndo != null) Text("Angre", color = Color(0xFFE5A00D), fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape)
                .clickable { vm.undoAs44() }.padding(horizontal = 12.dp).wrapContentHeight())
        }
    }
}
