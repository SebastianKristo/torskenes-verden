package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import no.kristo.finanshub.*

/*
 * Prompt 44 (claude-code-media-arr.md, claude-code-media-interaktivt-sok-504.md, claude-code-media-mobil-ikke-innlogget.md,
 * claude-code-avspilling-plex-jellyfin.md; fasit Media.dc.html og Avspilling.dc.html, variant mobil):
 *  - «Server: Hjemme ›» øverst i hver fane (ark med VELG SERVER · GJELDER SONARR, RADARR, QBITTORRENT OG PROWLARR), brikke når stedet mangler en tjeneste.
 *  - Søkefelt over filterpillene i Serier/Filmer, «Søk etter «X» for å legge til» ved ingen treff.
 *  - Interaktivt søk: «Søker i N indeksere … 23 s», én rad per indekser, delvise treff, Avbryt, «Hentet for 2 min siden · Søk igjen».
 *  - Episoder og filmer med fil: ⟳ Last ned på nytt (interaktivt søk) og Slett fil (bare admin), Angre i 5 s.
 *  - Banner med fanart øverst i serie/film.
 *  - Fanen Avspilling: Spilles nå · Historikk · Statistikk · Biblioteker, Plex/Jellyfin, «Logg inn med Plex».
 */

private val PLEX44 = Color(0xFFE5A00D)
private val JF44 = Color(0xFF7A5AD6)

/** «Server: Hjemme ›» (bare når det finnes flere steder) og brikken «Hytta mangler qBittorrent». */
@Composable
internal fun ServerRow44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    if (vm.p43.tab == "spill") return
    val sel = t.servers.firstOrNull { it.id == t.serverId }
    if (t.servers.size < 2 && t.serverNote == null) return
    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (t.servers.size >= 2) Row(Modifier.heightIn(min = 44.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape)
            .clickable(role = Role.Button, onClickLabel = "Velg server") { t.serverSheet = true }.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(OK43))
            Text("  Server: ${sel?.name ?: "Standard"} ›", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
        }
        t.serverNote?.let { n ->
            Text(n, color = WARN43, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 2, modifier = Modifier.weight(1f, fill = false)
                .clip(RoundedCornerShape(10.dp)).background(WARN43.copy(alpha = .12f)).padding(horizontal = 10.dp, vertical = 5.dp))
        }
    }
    if (t.serverSheet) ServerSheet44(vm)
}

@Composable
private fun ServerSheet44(vm: AppViewModel) {
    val p = PaperPal.current
    val t = vm.p44
    val tab = vm.p43.tab.let { if (it == "snart") "sonarr" else it }
    Sheet43({ t.serverSheet = false }) {
        PLabel("Velg server · gjelder Sonarr, Radarr, qBittorrent og Prowlarr")
        t.servers.forEach { s ->
            val on = s.id == t.serverId
            val has = s.svc[tab] != false
            Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(14.dp)).background(p.card).clickable { vm.pickServer44(s.id) }.padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(9.dp).clip(CircleShape).background(if (has) OK43 else p.line))
                Column(Modifier.weight(1f)) {
                    Text(s.name + if (s.def) " · standard" else "", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Text(s.svc.entries.joinToString(" · ") { (k, v) -> svcName44(k) + if (v) "" else " (mangler)" }, color = p.mut, fontSize = 12.sp, maxLines = 2)
                }
                if (on) Text("✓", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        }
        Btn43("+ Legg til server (Integrasjoner)", modifier = Modifier.fillMaxWidth()) { t.serverSheet = false; vm.p43.mediaOpen = false; vm.openIntegrations43() }
    }
}

/** Feil: «Utlogget fra Homelab» får en knapp til Kontoer og brukere, «Svarer ikke» får Prøv igjen. */
@Composable
internal fun ErrActions44(vm: AppViewModel) {
    if (vm.p43.error == null) return
    val k = vm.p44.errKind
    Row(Modifier.padding(start = 16.dp, top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (k == "token") Btn43("Logg inn på nytt", dark = true) { vm.p43.mediaOpen = false; vm.openPaperPage("set"); vm.settingsPage = "accounts" }
        if (k == "down" || k == "route" || k == "upstream") Btn43("Prøv igjen", dark = true) { vm.p43.error = null; vm.p44.errKind = null; vm.loadMedia43() }
        // Prompt 46: statuskode, tjeneste, adresse og tidspunkt for de siste Media-kallene (feilsøking av «Utlogget»).
        Btn43(if (vm.p46.mediaDetails) "Skjul detaljer" else "Vis detaljer") { vm.p46.mediaDetails = !vm.p46.mediaDetails }
    }
    if (vm.p46.mediaDetails) MediaDetails46(vm)
}

/** Søkefelt over filterpillene (Serier/Filmer). */
@Composable
internal fun LibSearch44(vm: AppViewModel, kind: String, total: Int) {
    val p = PaperPal.current
    val t = vm.p44
    Box(Modifier.fillMaxWidth().widthIn(max = 420.dp)) {
        Field43(t.libQ, if (kind == "tv") "Søk i $total serier" else "Søk i $total filmer") { t.libQ = it }
        if (t.libQ.isNotEmpty()) Text("✕", color = p.mut, fontSize = 16.sp, modifier = Modifier.align(Alignment.CenterEnd).size(44.dp).clip(CircleShape)
            .clickable(onClickLabel = "Tøm søket") { t.libQ = "" }.wrapContentSize())
    }
}

@Composable
internal fun LibNoHit44(vm: AppViewModel, kind: String) {
    val p = PaperPal.current
    val q = vm.p44.libQ.trim()
    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Ingen ${if (kind == "tv") "serier" else "filmer"} i biblioteket som heter «$q».", color = p.mut, fontSize = 13.sp)
        Btn43("Søk etter «$q» for å legge til", dark = true) {
            val s = vm.p43
            s.add = kind; s.addPick = null; vm.lookup43(kind, q)
        }
    }
}

/** Status mens søket går: tid, én rad per indekser, Avbryt; etterpå cache-linje og feilkort når alle feilet. */
@Composable
internal fun RelStatus44(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.p43; val t = vm.p44
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(s.relBusy) { while (s.relBusy) { now = System.currentTimeMillis(); delay(1000) } }
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (s.relBusy) {
            val sec = ((now - t.relStarted) / 1000).coerceAtLeast(0)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CircularProgressIndicator(color = p.ink, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                Text("Søker i ${t.relIdx.size.takeIf { it > 0 } ?: "alle"} indeksere … $sec s", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
                Btn43("Avbryt") { vm.cancelRelease44() }
            }
            if (sec > 20 && t.relIdx.isEmpty()) Text("Sonarr/Radarr spør alle indekserne. Det kan ta opptil 2 minutter.", color = p.mut, fontSize = 12.sp)
        }
        t.relIdx.forEach { x ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(when (x.state) { "ok" -> "✓"; "fail" -> "✕"; else -> "⟳" }, color = when (x.state) { "ok" -> OK43; "fail" -> RED43; else -> p.mut }, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.width(18.dp))
                Text(x.name, color = p.ink, fontSize = 12.5.sp, modifier = Modifier.weight(1f), maxLines = 1)
                Text(when (x.state) {
                    "ok" -> listOfNotNull(x.count?.let { "$it treff" }, x.ms?.let { String.format(java.util.Locale("nb", "NO"), "%.1f s", it / 1000.0) }).joinToString(" · ")
                    "fail" -> x.error ?: "svarte ikke"
                    else -> "søker …"
                }, color = if (x.state == "fail") RED43 else p.mut, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, maxLines = 1)
            }
        }
        t.relFromCache?.let { at ->
            val min = ((System.currentTimeMillis() - at) / 60_000).toInt()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (min < 1) "Hentet nå nettopp" else "Hentet for $min min siden", color = p.mut, fontSize = 12.sp, modifier = Modifier.weight(1f))
                Text("Søk igjen", color = p.lab, fontWeight = FontWeight.Bold, fontSize = 12.5.sp, modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape)
                    .clickable { s.relFor?.let { (a, b, c) -> vm.openRelease44(a, b, c, force = true) } }.padding(horizontal = 8.dp).wrapContentHeight())
            }
        }
        if (!s.relBusy && t.relFailAll) Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Ingen indeksere svarte. Sjekk Prowlarr → Helse.", color = RED43, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn43("Prøv igjen", dark = true) { s.relFor?.let { (a, b, c) -> vm.openRelease44(a, b, c, force = true) } }
                Btn43("Åpne Prowlarr") { s.relFor = null; s.rel = null; s.detail = null; s.tab = "prowlarr" }
            }
        }
    }
}

/** ⟳ Last ned på nytt og Slett (episode med fil). */
@Composable
internal fun EpFileBtns44(vm: AppViewModel, d: MItem43, se: MSeason43, e: MEp43) {
    val t = vm.p44
    Row(Modifier.padding(start = 84.dp, bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Btn43("⟳ Last ned på nytt") { vm.openRelease44(d.title, "S%02dE%02d · %s · erstatter filen".format(se.n, e.n, e.title), "episodeId=${e.id}") }
        if (vm.userIsAdmin) Btn43("Slett", color = RED43) { t.fileAsk = "ep" to e.id }
    }
    if (t.fileAsk == ("ep" to e.id)) Confirm44("Slette filen til E%02d? Overvåking slås av så den ikke lastes ned igjen.".format(e.n), "Slett filen", { t.fileAsk = null }) {
        t.fileAsk = null; vm.deleteEpFile44(e)
    }
}

/** ⟳ Last ned på nytt og Slett fil (film med fil). */
@Composable
internal fun MovieFileBtns44(vm: AppViewModel, d: MItem43) {
    val t = vm.p44
    if (!d.hasFile) return
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Btn43("⟳ Last ned på nytt") { vm.openRelease44(d.title, "Erstatter filen" + (d.profile?.let { " · Profil $it" } ?: ""), "movieId=${d.id}") }
        if (vm.userIsAdmin) Btn43("Slett fil", color = RED43) { t.fileAsk = "film" to d.id }
    }
    if (t.fileAsk == ("film" to d.id)) Confirm44("Slette filmfilen? Overvåking slås av.", "Slett fil", { t.fileAsk = null }) { t.fileAsk = null; vm.deleteMovieFile44() }
}

@Composable
private fun Confirm44(text: String, ok: String, cancel: () -> Unit, go: () -> Unit) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(14.dp)).background(p.card).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Btn43(ok, color = RED43, onClick = go); Btn43("Avbryt", onClick = cancel) }
    }
}

/** Toast med «Angre» i 5 s. */
@Composable
internal fun BoxScope.Undo44(vm: AppViewModel) {
    val p = PaperPal.current
    val u = vm.p44.undo ?: return
    LaunchedEffect(u) { delay(5000); if (vm.p44.undo === u) vm.p44.undo = null }
    val navB = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    Row(Modifier.align(Alignment.BottomCenter).padding(bottom = navB + 18.dp, start = 16.dp, end = 16.dp).clip(RoundedCornerShape(14.dp)).background(p.ink).padding(start = 14.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Text(u.first, color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.weight(1f, fill = false))
        Text("Angre", color = PLEX44, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.heightIn(min = 44.dp).clip(CircleShape)
            .clickable { u.second(); vm.p44.undo = null }.padding(horizontal = 12.dp).wrapContentHeight())
    }
}

/** Banner øverst i serie/film: fanart (uskarp) med mørk gradient, plakat 2:3 (104) og tittel. */
@Composable
internal fun Banner44(vm: AppViewModel, d: MItem43) {
    var bmp by remember(d.fanart) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(d.fanart) { val u = d.fanart; if (!u.isNullOrBlank()) bmp = if (u.startsWith("/")) vm.image(u) else vm.bgImage41(u) }
    val app = if (d.kind == "tv") "SONARR · SERIE" else "RADARR · FILM"
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(d.color?.let { Color(it) } ?: Color(0xFF2E3B4A))) {
        bmp?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize().blur(6.dp)) }
        Box(Modifier.matchParentSize().background(Brush.horizontalGradient(listOf(Color.Black.copy(alpha = .92f), Color.Black.copy(alpha = .55f)))))
        Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Poster43(vm, d.poster, d.color, d.title, 104.dp, 156.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(app, color = Color(0xFFF2A3B5), fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.5.sp, letterSpacing = 1.3.sp)
                Text(d.title, color = Color.White, fontFamily = PaperFonts.serif, fontSize = 26.sp, lineHeight = 28.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                Text(listOfNotNull(d.year?.toString(), d.network).joinToString(" · "), color = Color.White.copy(alpha = .8f), fontSize = 12.5.sp)
                val st = if (d.kind == "tv") "${d.have} av ${d.total} episoder" + (if (d.missing > 0) " · ${d.missing} mangler" else " · komplett") else if (d.hasFile) "Lastet ned" else "Mangler"
                Text(st, color = if ((d.kind == "tv" && d.missing == 0) || (d.kind != "tv" && d.hasFile)) Color(0xFF7FD19B) else Color(0xFFF2C14E), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOfNotNull(d.profile?.let { "PROFIL $it" }, if (d.monitored) "Overvåket" else "Ikke overvåket", if (d.kind == "tv") (if (d.ended) "Avsluttet" else "Fortsetter") else null).forEach { c ->
                        Text(c, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
                            modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(Color.White.copy(alpha = .14f)).padding(horizontal = 8.dp, vertical = 4.dp))
                    }
                }
            }
        }
    }
}

/* ---------------- Avspilling ---------------- */

private val PLAY_TABS44 = listOf("now" to "Spilles nå", "hist" to "Historikk", "stats" to "Statistikk", "libs" to "Biblioteker")

@Composable
internal fun Playback44(vm: AppViewModel, pad: PaddingValues) {
    val p = PaperPal.current
    val t = vm.p44
    val ctx = LocalContext.current
    LaunchedEffect(t.playTab, t.playSrv) { vm.loadPlayback44() }
    // Spilles nå oppdateres hvert 10. s mens fanen er åpen.
    LaunchedEffect(t.playTab, vm.p43.tab) { while (t.playTab == "now" && vm.p43.tab == "spill") { delay(10_000); vm.loadPlayback44() } }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = pad, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Pill43("● Plex", t.playSrv == "plex") { t.playSrv = "plex" }
                Pill43("● Jellyfin", t.playSrv == "jellyfin") { t.playSrv = "jellyfin" }
            }
        }
        item {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                PLAY_TABS44.forEach { (k, n) -> Pill43(n, t.playTab == k) { t.playTab = k } }
            }
        }
        if (t.playSrv == "plex") item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.heightIn(min = 44.dp).clip(CircleShape).background(PLEX44).clickable(enabled = !t.plexBusy, role = Role.Button) { vm.plexLogin44 { openLink(ctx, it) } }
                    .padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                    Text(if (t.plexBusy) "Venter på godkjenning …" else "Logg inn med Plex", color = Color(0xFF1B1A17), fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                }
                t.plexPin?.let { Text("kode $it", color = p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Bold, fontSize = 14.sp) }
            }
        }
        t.playErr?.let { e -> item { Text(e, color = RED43, fontSize = 13.sp) } }
        if (t.playMissing) item { Text("Avspilling finnes ikke på serveren ennå. Oppdater Homelab.", color = p.mut, fontSize = 13.sp) }
        when (t.playTab) {
            "now" -> {
                val l = t.sessions
                if (l == null && !t.playMissing) item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
                else if (l.isNullOrEmpty()) item { Text("Ingen spiller noe akkurat nå.", color = p.mut, fontSize = 13.sp) }
                l.orEmpty().forEach { x -> item(key = "ps-" + x.id) { Session44(vm, x) } }
            }
            "hist" -> {
                item { Field43(t.histQ, "Søk i tittel, bruker eller enhet", onDone = { vm.loadPlayback44() }) { t.histQ = it } }
                val users = t.history.orEmpty().map { it.user }.filter { it.isNotBlank() }.distinct()
                if (users.size > 1) item {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Pill43("Alle", t.histUser == null) { t.histUser = null; vm.loadPlayback44() }
                        users.forEach { u -> Pill43(u, t.histUser == u) { t.histUser = u; vm.loadPlayback44() } }
                    }
                }
                if (t.history?.isEmpty() == true) item { Text("Ingen historikk ennå.", color = p.mut, fontSize = 13.sp) }
                t.history.orEmpty().forEachIndexed { i, h -> item(key = "ph-$i") { Hist44(vm, h) } }
            }
            "stats" -> {
                item {
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        t.stats.orEmpty().forEach { k ->
                            Column(Modifier.widthIn(min = 120.dp).clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp)) {
                                PLabel(k.label, color = p.mut); PSerif(k.value, 28.sp, maxLines = 1)
                            }
                        }
                    }
                }
                t.statLists.forEach { (n, rows) ->
                    item {
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            PLabel(n)
                            rows.forEachIndexed { i, r -> Text("${i + 1}. $r", color = p.ink, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        }
                    }
                }
            }
            else -> t.libs.orEmpty().forEachIndexed { i, l ->
                item(key = "pl-$i") {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        PSerif(l.name, 19.sp, maxLines = 1)
                        Text(listOfNotNull(l.count?.let { "$it titler" }, l.size?.let { size43(it) }, l.hours?.let { "$it t spilt" }).joinToString(" · "), color = p.ink, fontSize = 13.sp)
                        l.last?.let { Text("Sist lagt til: $it", color = p.mut, fontSize = 12.sp, maxLines = 1) }
                    }
                }
            }
        }
    }
}

@Composable
private fun Session44(vm: AppViewModel, x: PSess44) {
    val p = PaperPal.current
    val acc = if (x.server == "jellyfin") JF44 else PLEX44
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.card).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Poster43(vm, x.poster, null, x.title, 64.dp, 96.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(if (x.direct) "Direkte avspilling" else "Omkoder", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 10.5.sp,
                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(if (x.direct) OK43 else RED43).padding(horizontal = 6.dp, vertical = 2.dp))
            PSerif(x.title, 17.sp, maxLines = 1)
            x.sub?.let { Text(it, color = p.ink, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            if (x.tech.isNotEmpty()) Text(x.tech.joinToString(" · "), color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.sp, maxLines = 2)
            Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(p.line)) {
                Box(Modifier.fillMaxWidth(x.progress.coerceIn(0f, 1f)).fillMaxHeight().background(acc))
            }
            Text(listOfNotNull(x.user.ifBlank { null }, x.device, x.left?.let { if (it.contains("igjen")) it else "$it igjen" }).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1)
        }
    }
}

@Composable
private fun Hist44(vm: AppViewModel, h: PHist44) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Poster43(vm, h.poster, null, h.title, 40.dp, 60.dp)
        Column(Modifier.weight(1f)) {
            Text(h.title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(h.sub, h.user.ifBlank { null }, h.device).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(h.at.take(16).replace('T', ' ').ifBlank { null }, h.duration).joinToString(" · "), color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.sp, maxLines = 1)
        }
        h.pct?.let { Text("$it %", color = if (it >= 90) OK43 else p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
    }
}
