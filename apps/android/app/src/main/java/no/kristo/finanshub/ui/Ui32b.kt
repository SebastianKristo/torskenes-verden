package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.ViewWeek
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.LocalDate

/*
 * Prompt 32 (ANDROID32): felles «Rediger fanelinjen»-ark med Papir-knapper (claude-code-fanelinje-ark-knapper.md) for Hjem, Finans,
 * Domener, Abonnement og Familie; Innstillinger → FANELINJE · ANDRE SIDER; logoer på Integrasjoner; Hjem-widgeten Prøveperioder (h11);
 * GLIMT I SØKEFELTET; info fra den gamle Oppdatering-siden på Nordlys-siden; Huskeliste → Arkivert.
 */

/* ======================= «Rediger fanelinjen» ======================= */

/** Én fane i arket: nøkkel, navn og ikon (tegn). */
internal data class NavEd32b(val key: String, val label: String, val icon: String)

/**
 * Arket «Rediger fanelinjen» (fasit: arket ne). Etikett «HJEM · FANELINJE», tittel Newsreader 26, Ferdig = SheetButton primary.
 * Ingen Avbryt: endringene lagres når arket lukkes (Ferdig, trykk utenfor eller dra ned). Rader: ikon (40, rund 12) · navn · ↑ · −.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun NavEditor32b(
    vm: AppViewModel, title: String, initial: List<NavEd32b>, all: List<NavEd32b>, max: Int, mer: Boolean, icons: List<String>,
    onSave: (List<NavEd32b>) -> Unit, onReset: () -> List<NavEd32b>, onClose: () -> Unit,
) {
    val p = PaperPal.current
    var items by remember { mutableStateOf(initial) }
    var dirty by remember { mutableStateOf(false) }
    var iconFor by remember { mutableStateOf<String?>(null) }
    fun set(v: List<NavEd32b>) { items = v; dirty = true }
    fun defLabel(k: String) = all.firstOrNull { it.key == k }?.label ?: k
    val close: () -> Unit = {
        if (dirty) onSave(items.map { if (it.label.isBlank()) it.copy(label = defLabel(it.key)) else it })
        onClose()
    }
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = close, sheetState = state, containerColor = p.bg, contentColor = p.ink, shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(width = 40.dp, height = 5.dp, color = p.line) },
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding()
                .padding(start = 18.dp, end = 18.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    PLabel("$title · fanelinje")
                    PSerif("Rediger fanelinjen", 26.sp, modifier = Modifier.padding(top = 4.dp), maxLines = 1)
                }
                SheetButton30("Ferdig", onClick = close)
            }
            Text("${items.size} av $max faner" + if (mer) " · Mer ligger alltid sist" else "", color = p.mut, fontSize = 12.5.sp, fontFamily = PaperFonts.sans)
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).padding(12.dp, 2.dp)) {
                items.forEachIndexed { i, t ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Column(Modifier.padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(
                                Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(p.bg)
                                    .border(if (iconFor == t.key) 1.5.dp else 1.dp, if (iconFor == t.key) p.ink else p.line, RoundedCornerShape(12.dp))
                                    .clickable(role = Role.Button, onClickLabel = "Velg ikon") { iconFor = if (iconFor == t.key) null else t.key },
                                contentAlignment = Alignment.Center,
                            ) { GlyphIcon(t.icon, p.ink, 19.dp) }
                            BasicTextField(
                                t.label, { v -> set(items.map { if (it.key == t.key) it.copy(label = v.take(18)) else it }) }, singleLine = true,
                                textStyle = TextStyle(color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, fontFamily = PaperFonts.sans),
                                cursorBrush = SolidColor(p.lab),
                                modifier = Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(14.dp)).background(p.bg).padding(horizontal = 12.dp),
                                decorationBox = { inner -> Box(Modifier.fillMaxHeight(), contentAlignment = Alignment.CenterStart) { if (t.label.isEmpty()) Text(defLabel(t.key), color = p.mut, fontSize = 15.sp); inner() } },
                            )
                            Box(
                                Modifier.size(40.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).alpha(if (i > 0) 1f else .3f)
                                    .clickable(enabled = i > 0, role = Role.Button, onClickLabel = "Flytt opp") { Haptics.select(); set(items.toMutableList().also { l -> val x = l[i]; l[i] = l[i - 1]; l[i - 1] = x }) },
                                contentAlignment = Alignment.Center,
                            ) { Text("↑", color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.Bold) }
                            Box(
                                Modifier.size(36.dp).clip(CircleShape).alpha(if (items.size > 1) 1f else .3f)
                                    .clickable(enabled = items.size > 1, role = Role.Button, onClickLabel = "Fjern") { Haptics.select(); set(items.filter { it.key != t.key }) },
                                contentAlignment = Alignment.Center,
                            ) { Text("−", color = p.lab, fontSize = 22.sp, fontWeight = FontWeight.Bold) }
                        }
                        if (iconFor == t.key) FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            icons.forEach { ic ->
                                val on = ic == t.icon
                                Box(
                                    Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(if (on) p.ink else p.bg).border(1.dp, p.line, RoundedCornerShape(12.dp))
                                        .clickable { set(items.map { if (it.key == t.key) it.copy(icon = ic) else it }); iconFor = null },
                                    contentAlignment = Alignment.Center,
                                ) { GlyphIcon(ic, if (on) p.bg else p.ink) }
                            }
                        }
                    }
                }
            }
            NavStyleSection25(vm, items.map { TabItem(it.key, it.label.ifBlank { defLabel(it.key) }, it.icon) }, mer = mer)
            val missing = all.filter { a -> items.none { it.key == a.key } }
            if (missing.isNotEmpty() && items.size < max) {
                PLabel("Legg til")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    missing.forEach { m ->
                        Row(
                            Modifier.height(40.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape)
                                .clickable { Haptics.select(); set(items + m) }.padding(horizontal = 14.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
                        ) {
                            GlyphIcon(m.icon, p.ink, 15.dp)
                            Text("+ ${m.label}", color = p.ink, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
            Text(
                "Tilbakestill til standard", color = p.mut, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, textDecoration = TextDecoration.Underline,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { Haptics.select(); items = onReset(); dirty = false }.padding(4.dp, 10.dp),
            )
        }
    }
}

/** Ikonene en side-fane kan få: sidens egne tegn og Hjem-ikonene. */
private fun secIcons32b(sec: String): List<String> =
    ((SEC32B[sec]?.second?.map { it.third } ?: emptyList()) + listOf("◎", "◍", "⚡", "▤", "⌂", "◔", "↻", "◌", "♡", "≡", "▥") + TAB_ICONS).distinct()

/** «Rediger fanelinjen» for Domener, Abonnement eller Familie (vm.p32b.secEdit). */
@Composable
internal fun SecNavEditor32b(vm: AppViewModel) {
    val sec = vm.p32b.secEdit ?: return
    val def = SEC32B[sec] ?: return
    val all = def.second.map { NavEd32b(it.first, it.second, it.third) }
    key(sec) {
        NavEditor32b(
            vm, def.first, vm.secTabs32b(sec).map { NavEd32b(it.first, it.second, it.third) }, all, all.size, mer = false, icons = secIcons32b(sec),
            onSave = { l -> vm.saveSecNav32b(sec, l.map { Triple(it.key, it.label, it.icon) }) },
            onReset = { vm.resetSecNav32b(sec); all },
            onClose = { vm.p32b.secEdit = null },
        )
    }
}

/** Innstillinger → Utseende og fanelinje: FANELINJE · ANDRE SIDER. */
@Composable
internal fun SecNavSettings32b(vm: AppViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Fanelinje · andre sider", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            SEC32B.entries.forEachIndexed { i, (sec, d) ->
                val n = vm.secTabs32b(sec).size
                SetRow(vm, i + 2, Icons.Filled.ViewWeek, d.first, "$n av ${d.second.size} faner · hold inne på fanelinjen", "Rediger ›", top = i > 0) { Haptics.select(); vm.p32b.secEdit = sec }
            }
        }
    }
}

/* ======================= Integrasjoner: logoer ======================= */

/**
 * Ekte logo (hvit rute, radius 10, tynn innerkant, logo 22 px) i stedet for bokstavmerket. Logoen hentes én gang via serverens
 * logo-cache (/finans/api/logo/<domene>). Bokstavmerket vises mens den lastes, og hvis den feiler eller er standardgloben.
 */
@Composable
internal fun IntegLogo32b(vm: AppViewModel, id: String, badge: String, color: Long, size: Int = 34) {
    val dom = integDomain32b(id)
    val bmp by produceState<Bitmap?>(null, dom) { value = dom?.let { d -> runCatching { vm.logo(d) }.getOrNull()?.takeIf { it.width > 16 && it.height > 16 } } }
    val b = bmp
    if (b == null) { IntegBadge26(badge, color, size); return }
    val r = (size * 10f / 34f).dp
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape(r)).background(Color.White).border(1.dp, Color(0x141B1A17), RoundedCornerShape(r)),
        contentAlignment = Alignment.Center,
    ) {
        // MET / Yr fyller hele ruten.
        val inner: Dp = if (id == "met") size.dp else (size * 22f / 34f).dp
        Image(b.asImageBitmap(), null, Modifier.size(inner).clip(RoundedCornerShape(if (id == "met") r else 4.dp)), contentScale = ContentScale.Fit)
    }
}

/* ======================= Hjem: Prøveperioder (h11) ======================= */

@Composable
private fun TrialLogo32b(vm: AppViewModel, name: String, size: Dp, inner: Dp, radius: Dp, frame: Boolean) {
    val p = PaperPal.current
    val dom = trialDomain32b(name)
    val bmp by produceState<Bitmap?>(null, dom) { value = runCatching { vm.logo(dom) }.getOrNull() }
    Box(
        Modifier.size(size).clip(RoundedCornerShape(radius)).background(if (frame) Color.White else Color.Transparent)
            .then(if (frame) Modifier.border(1.dp, p.line, RoundedCornerShape(radius)) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        val b = bmp
        if (b != null) Image(b.asImageBitmap(), null, Modifier.size(inner).clip(RoundedCornerShape(4.dp)), contentScale = ContentScale.Fit)
        else Text(name.take(1).uppercase(), color = p.ink, fontFamily = PaperFonts.serif, fontSize = (inner.value * .7f).sp)
    }
}

/**
 * «PRØVEPERIODER · 3 AKTIVE» · logo · navn (Newsreader) · «Avslutt før … · deretter 149 kr/mnd» · stort tall · fremdrift ·
 * chips for de neste · Jeg har avsluttet / Behold. Trykk åpner Abonnement.
 */
@Composable
internal fun HomeTrials32b(vm: AppViewModel) {
    val p = PaperPal.current
    LaunchedEffect(vm.account?.id) { if (vm.p31.trials.isEmpty()) vm.loadTrials31() }
    val today = LocalDate.now(OSLO31)
    val list = vm.p31.trials.filter { it.status == "active" && trialDays32b(it.endsAt, today) >= 0 }.sortedBy { it.endsAt }
    val top = list.firstOrNull()
    val openAbo = { Haptics.select(); vm.openFromMer(Screen.Sub) }
    PCard(onClick = openAbo) {
        Column(Modifier.padding(16.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                PLabel("Prøveperioder · " + if (list.isEmpty()) "ingen" else "${list.size} aktive", modifier = Modifier.weight(1f))
                Text("alle ›", color = p.mut, fontSize = 12.sp)
            }
            if (top == null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Ingen aktive prøver. Skriv «Viaplay gratis i 14 dager» i søket.", color = p.mut, fontSize = 14.sp, modifier = Modifier.weight(1f))
                    Box(
                        Modifier.height(34.dp).clip(CircleShape).background(p.bg).clickable(role = Role.Button) {
                            Haptics.select(); vm.openFromMer(Screen.Sub); vm.resetTrialForm31(); vm.b28.addStep = "trial"; vm.subAdding = true
                        }.padding(horizontal = 14.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("+ Legg til", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                }
                return@Column
            }
            val dd = trialDays32b(top.endsAt, today)
            val c = trialColor32b(dd)?.let { Color(it) } ?: p.ink
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TrialLogo32b(vm, top.service, 40.dp, 24.dp, 12.dp, frame = true)
                Column(Modifier.weight(1f)) {
                    PSerif(top.service, 20.sp, maxLines = 1)
                    Text("Avslutt før ${dShort31(top.endsAt)}" + (top.priceAfter.takeIf { it.isNotBlank() }?.let { " · deretter $it" } ?: ""),
                        color = p.mut, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Column(horizontalAlignment = Alignment.End) {
                    PSerif(if (dd == 0) "I dag" else "$dd", 28.sp, color = c, maxLines = 1)
                    Text(when (dd) { 0 -> "siste dag"; 1 -> "dag igjen"; else -> "dager igjen" }, color = c, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                }
            }
            val pct = trialPct32b(top.endsAt, vm.p32b.trialStart[top.id], today)
            Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(3.dp)).background(p.line)) {
                Box(Modifier.fillMaxHeight().fillMaxWidth(pct).clip(RoundedCornerShape(3.dp)).background(c))
            }
            val more = list.drop(1).take(2)
            if (more.isNotEmpty()) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                more.forEach { x ->
                    val xd = trialDays32b(x.endsAt, today)
                    Row(
                        Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(p.bg).padding(horizontal = 9.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
                    ) {
                        TrialLogo32b(vm, x.service, 16.dp, 16.dp, 4.dp, frame = false)
                        Text(x.service, color = p.ink, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Text("$xd d", color = trialColor32b(xd)?.let { Color(it) } ?: p.ink, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 11.sp)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier.weight(1f).height(38.dp).clip(CircleShape).background(p.ink).clickable(role = Role.Button) {
                        Haptics.success(); vm.patchTrial31(top.id, "cancelled"); vm.flash("✓ ${top.service} avsluttet · påminnelsen er fjernet")
                    },
                    contentAlignment = Alignment.Center,
                ) { Text("Jeg har avsluttet", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                Box(
                    Modifier.height(38.dp).clip(CircleShape).background(p.bg).clickable(role = Role.Button) {
                        Haptics.select(); vm.patchTrial31(top.id, "kept"); vm.flash("${top.service} beholdes · flyttet til Abonnement")
                    }.padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) { Text("Behold", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
            }
        }
    }
}

/* ======================= AI og tolkning → GLIMT I SØKEFELTET ======================= */

@Composable
internal fun GlimtSearchSettings32b(vm: AppViewModel) {
    val s = vm.p32b
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Glimt i søkefeltet", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            SetRow(vm, 0, Icons.Filled.AutoAwesome, "Send til Chat etter", "Enkle oppgaver fullføres i søkefeltet. Tar svaret lengre tid, fortsetter det i Chat.", "${s.hsTimeout} s") { vm.nextHsTimeout32b() }
            PToggle("Lagre søkehistorikk", "Søk fra telefonen vises under «Nylige søk» på web. Bare du ser dem.", s.searchHist, top = true) { vm.setSearchHist32b(it) }
        }
    }
}

/* ======================= Nordlys-siden: fra den gamle Oppdatering-siden ======================= */

/** «Installert 4.24.0 · build 8512626» med Kopier, og Se etter oppdatering / Logg på web. */
@Composable
internal fun NordlysInstalled32b(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val clip = LocalClipboardManager.current
    val u = vm.p30.upd
    val sha = vm.p31.sha
    val line = "Installert ${u.current.ifBlank { "–" }}" + (sha.takeIf { it.isNotBlank() }?.let { " · build ${it.take(7)}" } ?: "")
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(line, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Box(
                Modifier.height(30.dp).clip(CircleShape).background(Color(0x141B1A17)).clickable(role = Role.Button) { clip.setText(AnnotatedString(line)); vm.flash("Kopiert") }
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Kopier", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
        }
        PCard(Modifier.hl34(vm, "chk")) { // prompt 34: mål «chk»
            PRow("Se etter oppdatering", if (vm.p31.checking) "Sjekker …" else "Spør serveren om det finnes en ny versjon", "›", serif = false) { vm.checkNordlys31() }
            if (vm.userIsAdmin) PRow("Logg", "Oppdateringsloggen i nettleseren", "↗", serif = false, top = true) { openLink(ctx, upd28WebUrl(vm)) }
        }
    }
}

/* ======================= Huskeliste: Arkivert ======================= */

/** Arkivikonet (boks) ved siden av × på en fullført oppgave. */
@Composable
internal fun ArchiveBtn32b(onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(32.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Arkiver", onClick = onClick), contentAlignment = Alignment.Center) {
        WxIcon("M3 4h18v4H3zM5 8v12h14V8M10 12h4", p.mut, 17.dp, stroke = 2f)
    }
}

/** «Arkiver alle» til høyre for FERDIG. */
@Composable
internal fun ArchiveAll32b(onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.height(30.dp).clip(CircleShape).background(p.card).clickable(role = Role.Button, onClick = onClick).padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
        Text("Arkiver alle", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
    }
}

/** Listen «ARKIVERT · N» med ↺ Gjenopprett og × per rad, og Tøm arkivet øverst. */
@Composable
internal fun ArchivedList32b(vm: AppViewModel, lists: List<TaskList>) {
    val p = PaperPal.current
    val s = vm.p32b
    LaunchedEffect(Unit) { vm.loadArchived32b() }
    val l = s.archived
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PLabel("Arkivert · ${l?.size ?: 0}", modifier = Modifier.weight(1f).padding(start = 4.dp))
            if (!l.isNullOrEmpty()) Box(
                Modifier.height(30.dp).clip(CircleShape).background(if (s.archClearArm) p.lab else p.card).clickable(role = Role.Button) { vm.emptyArchive32b() }.padding(horizontal = 12.dp),
                contentAlignment = Alignment.Center,
            ) { Text(if (s.archClearArm) "Trykk igjen for å tømme" else "Tøm arkivet", color = if (s.archClearArm) p.onLab else p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
        }
        when {
            l == null -> Text("Henter arkivet …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(4.dp))
            l.isEmpty() -> Text("Ingenting i arkivet. Fullførte oppgaver arkiveres automatisk etter 7 dager.", color = p.mut, fontSize = 13.5.sp, lineHeight = 19.sp, modifier = Modifier.padding(4.dp))
            else -> PCard {
                l.forEachIndexed { i, t ->
                    if (i > 0) Box(Modifier.fillMaxWidth().padding(start = 16.dp).height(1.dp).background(p.line))
                    val ln = lists.firstOrNull { it.id == t.list }
                    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 6.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(t.title, color = p.mut, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis, textDecoration = TextDecoration.LineThrough)
                            if (ln != null) Text(ln.name, color = p.mut, fontSize = 12.sp, maxLines = 1)
                        }
                        Box(
                            Modifier.height(32.dp).clip(CircleShape).background(p.bg).clickable(role = Role.Button, onClickLabel = "Gjenopprett") { vm.restoreTask32b(t.id) }.padding(horizontal = 12.dp),
                            contentAlignment = Alignment.Center,
                        ) { Text("↺ Gjenopprett", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 12.5.sp) }
                        Box(Modifier.size(32.dp).clip(CircleShape).clickable(role = Role.Button, onClickLabel = "Slett for godt") { vm.deleteArchived32b(t.id) }, contentAlignment = Alignment.Center) {
                            Text("×", color = p.mut, fontSize = 20.sp)
                        }
                    }
                }
            }
        }
    }
}
