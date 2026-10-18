package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
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
 * Prompt 26 (ANDROID-B): Innstillinger → Integrasjoner som på web (gruppert liste med merke, navn, beskrivelse og status,
 * og egen side per integrasjon med OPPSETT, SLIK GJØR DU, Test og Fjern), og Innstillinger → Kalendere
 * (Google Kalender og Home Assistant, flyttet fra Bursdager, pluss Skole-iCal og Canvas).
 */

/** Tittelen i fotovinduet for en underside i Innstillinger. */
internal fun settingsTitle26(vm: AppViewModel): String {
    val pg = vm.settingsPage ?: return "Innstillinger"
    if (pg == "kal") return "Kalendere"
    if (pg.startsWith("integ:")) {
        val id = pg.removePrefix("integ:")
        return (vm.b24.integ ?: INTEG24_FALLBACK).firstOrNull { it.id == id }?.name ?: "Integrasjon"
    }
    return PAPER_SET_TITLES[pg] ?: "Innstillinger"
}

/** Kort undertekst for Kalendere (Google og HA), som i designet. */
private fun kalSummary26(vm: AppViewModel): Pair<String, Boolean> {
    val g = vm.bd24.google.connected
    val h = vm.bd24.ha.entityId != null && vm.bd24.ha.syncedAt != null
    return if (g || h) listOfNotNull(if (g) "Google" else null, if (h) "HA" else null).joinToString(" + ") to true else "Ikke koblet" to false
}

/* ---------------- Merket (farget rute med kort tekst) ---------------- */

@Composable
internal fun IntegBadge26(text: String, color: Long, size: Int = 34) {
    Box(Modifier.size(size.dp).clip(RoundedCornerShape((size * .3f).dp)).background(Color(color)), contentAlignment = Alignment.Center) {
        Text(text, color = Color.White, fontWeight = FontWeight.Bold, fontSize = (if (text.length > 2) size * .3f else size * .36f).sp, maxLines = 1, fontFamily = PaperFonts.mono)
    }
}

@Composable
private fun IntegRow26(badge: String, color: Long, title: String, sub: String?, value: String, valueColor: Color, top: Boolean, chev: Boolean = true, onClick: (() -> Unit)?) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().padding(start = 62.dp).height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier).padding(14.dp, 11.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            IntegBadge26(badge, color)
            Column(Modifier.weight(1f)) {
                Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!sub.isNullOrBlank()) Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (value.isNotEmpty()) Text(value, color = valueColor, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 150.dp))
            if (chev) Text("›", color = p.mut, fontSize = 17.sp)
        }
    }
}

/* ---------------- Listen ---------------- */

@Composable
internal fun IntegList26(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.b24
    LaunchedEffect(Unit) { vm.b24LoadIntegrations(); vm.loadBirthdays24(quiet = true) }
    val all = (s.integ ?: emptyList()).filter { vm.userIsAdmin || it.personal }
    val cal = all.firstOrNull { it.id == "calendars" }
    // Én rad for Kalendere (Informasjon), uansett om serveren har «calendars» ennå.
    val rows = all.filter { it.id !in INTEG26_ON_KAL && !it.hidden }.map { it to integMeta26(it) } +
        listOfNotNull((cal ?: Integ24("calendars", "Kalendere", null, "missing", emptyList(), false, "personal")).let { it to integMeta26(it) })
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        s.integError?.let { Text(it, color = if (s.integLegacy) p.mut else p.lab, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp)) }
        if (s.integ == null) Text("Henter integrasjonene …", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(4.dp))
        INTEG26_CATS.forEach { cat ->
            val list = rows.filter { it.second.category == cat }
            if (list.isEmpty()) return@forEach
            PLabel(cat, modifier = Modifier.padding(start = 4.dp, top = 10.dp))
            PCard {
                list.forEachIndexed { idx, (i, m) ->
                    val (st, ok) = if (i.id == "calendars" && cal?.statusText == null) kalSummary26(vm) else integStatus26(i)
                    Box(Modifier.hl25(vm, "integ:${i.id}")) {
                        IntegRow26(m.badge, m.color, if (i.id == "calendars") "Kalendere" else i.name, m.description, st, if (ok) p.pos else p.lab, top = idx > 0) { vm.openInteg26(i.id) }
                    }
                }
            }
        }
        if (s.integ != null) Text(
            if (vm.userIsAdmin) "Dine integrasjoner og serverens felles oppsett. Hemmelige verdier lagres kryptert og vises aldri i appen."
            else "Bare du ser og bruker disse. Hemmelige verdier lagres kryptert og vises aldri i appen.",
            color = p.mut, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 6.dp),
        )
    }
}

/* ---------------- Én integrasjon ---------------- */

@Composable
internal fun IntegPage26(vm: AppViewModel, id: String) {
    val p = PaperPal.current
    val s = vm.b24
    LaunchedEffect(id) { if (s.integ == null) vm.b24LoadIntegrations() }
    val i = (s.integ ?: INTEG24_FALLBACK).firstOrNull { it.id == id }
    if (i == null) {
        Text(if (s.integ == null) "Henter …" else "Fant ikke integrasjonen.", color = p.mut, fontSize = 13.sp, modifier = Modifier.padding(8.dp))
        return
    }
    val m = integMeta26(i)
    val (st, ok) = integStatus26(i)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PCard(shadow = true) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                IntegBadge26(m.badge, m.color, 46)
                Column(Modifier.weight(1f)) {
                    PSerif(i.name, 22.sp, maxLines = 2)
                    Text(m.description, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Text(st, color = if (ok) p.pos else p.lab, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, modifier = Modifier.widthIn(max = 120.dp))
            }
        }
        IntegFields26(vm, i, "Oppsett")
        // Egne sider for Trading 212, bank og AI (som designet), og synk av lister for Home Assistant.
        when (id) {
            "t212" -> LinkCard26("Aksjer · Trading 212", "Miljø, synk og visning") { vm.settingsPage = "stocks" }
            "bank" -> LinkCard26("Bankimport", "DNB · CSV · ✦ AI") { vm.openFromMer(Screen.Import) }
            "ai" -> LinkCard26("AI og tolkning", "Motorer, rekkefølge og tidsgrenser") { vm.settingsPage = "ai" }
            "ha" -> if (vm.userIsAdmin) IntegrationsPage23(vm)
        }
        GuideCard26(m.guide)
        IntegActions26(vm, i)
    }
}

/** OPPSETT: én rad per felt, og feltet redigeres rett under raden (hemmeligheter vises aldri). */
@Composable
internal fun IntegFields26(vm: AppViewModel, i: Integ24, title: String) {
    val p = PaperPal.current
    val s = vm.b24
    if (i.fields.isEmpty()) return
    PLabel(title, modifier = Modifier.padding(start = 4.dp, top = 10.dp))
    PCard {
        i.fields.forEachIndexed { idx, f ->
            val editing = s.integEdit == (i.id to f.key)
            val shown = when {
                f.type == "secret" && f.saved -> "•••• lagret"
                !f.value.isNullOrBlank() -> f.value
                f.saved -> "•••• lagret"
                else -> "Ikke satt"
            }
            IRow24(vm, -1, null, f.label, f.help, "$shown ›", if (f.saved || !f.value.isNullOrBlank()) p.ink else p.lab, top = idx > 0) {
                s.integEdit = if (editing) null else i.id to f.key
            }
            if (editing) IntegEditor24(vm, i, f)
        }
    }
}

/** SLIK GJØR DU: nummererte steg. */
@Composable
internal fun GuideCard26(guide: List<Pair<String, String>>) {
    val p = PaperPal.current
    if (guide.isEmpty()) return
    PLabel("Slik gjør du", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
    PCard {
        guide.forEachIndexed { n, (t, d) ->
            Column {
                if (n > 0) Box(Modifier.fillMaxWidth().padding(start = 58.dp).height(1.dp).background(p.line))
                Row(Modifier.fillMaxWidth().padding(14.dp, 11.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(p.ink), contentAlignment = Alignment.Center) {
                        Text("${n + 1}", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 13.sp, fontFamily = PaperFonts.mono)
                    }
                    Column(Modifier.weight(1f)) {
                        if (t.isNotBlank()) Text(t, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp)
                        if (d.isNotBlank()) Text(d, color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp)
                    }
                }
            }
        }
    }
}

/** Test tilkobling og Fjern alle verdier (trykk to ganger). */
@Composable
private fun IntegActions26(vm: AppViewModel, i: Integ24) {
    val p = PaperPal.current
    val s = vm.b24
    val any = i.fields.any { it.saved || !it.value.isNullOrBlank() }
    if (!i.canTest && !any) return
    Spacer(Modifier.height(4.dp))
    PCard {
        var top = false
        if (i.canTest) {
            IRow24(vm, -1, null, if (s.integBusy == i.id) "Tester …" else "Test tilkobling", null, "", p.lab, top = false, titleColor = p.lab) {
                if (s.integBusy == null) vm.b24TestIntegration(i)
            }
            top = true
        }
        if (any) {
            val armed = vm.b26.clearArm == i.id
            IRow24(vm, -1, null, if (armed) "Trykk igjen for å fjerne alt" else "Fjern alle verdier", if (armed) "Feltene for ${i.name} blir tomme" else null, "", p.lab, top = top, titleColor = p.lab) {
                if (s.integBusy != null) return@IRow24
                if (armed) vm.b26ClearAll(i) else vm.b26.clearArm = i.id
            }
        }
    }
    LaunchedEffect(vm.b26.clearArm) { if (vm.b26.clearArm != null) { delay(4_000); vm.b26.clearArm = null } }
}

@Composable
private fun LinkCard26(title: String, sub: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Spacer(Modifier.height(4.dp))
    PCard(onClick = onClick) {
        Row(Modifier.fillMaxWidth().padding(14.dp, 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Text(sub, color = p.mut, fontSize = 12.5.sp)
            }
            Text("Åpne ›", color = p.mut, fontSize = 13.sp)
        }
    }
}

/* ---------------- Kalendere ---------------- */

/** Innstillinger → Kalendere: Google Kalender og Home Assistant (fra Bursdager), Skole-iCal og Canvas, og Google-klienten (admin). */
@Composable
internal fun KalSettings26(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    val s = vm.bd24
    LaunchedEffect(Unit) { vm.loadBirthdays24(quiet = true); vm.loadHaCals24(); vm.b24LoadIntegrations() }
    LaunchedEffect(s.google.connected) { if (s.google.connected) vm.loadGoogleCals24() }
    // Etter «Logg inn med Google» i Custom Tab: spør serveren til kontoen er koblet til (som på Bursdager).
    LaunchedEffect(s.authAt) { while (s.authAt != 0L) { delay(3_000); vm.pollGoogle24() } }
    val list = vm.b24.integ ?: emptyList()
    val cals = list.firstOrNull { it.id == "calendars" }
    val school = cals ?: list.firstOrNull { it.id == "calendar" }
    val google = list.firstOrNull { it.id == "google" }?.takeIf { vm.userIsAdmin }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) { BdCalendars(vm, ctx) }
        if (school != null) {
            IntegFields26(vm, school, "Skole og Canvas")
            if (cals == null) Text("Canvas-iCal kommer når serveren er oppdatert. Skole-iCal brukes av Kalender-siden.", color = p.mut, fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 4.dp))
            if (school.canTest) PCard {
                IRow24(vm, -1, null, if (vm.b24.integBusy == school.id) "Tester …" else "Test kalenderne", null, "", p.lab, top = false, titleColor = p.lab) {
                    if (vm.b24.integBusy == null) vm.b24TestIntegration(school)
                }
            }
        }
        if (google != null) IntegFields26(vm, google, "Google-klient (server)")
        GuideCard26((cals ?: Integ24("calendars", "Kalendere", null, "missing", emptyList(), false)).let { integMeta26(it).guide })
    }
}

/** Bursdager: lenkeraden «Kalendere · Google … · HA … · Innstillinger ›» (oppsettet ligger i Innstillinger → Kalendere). */
@Composable
internal fun BdCalLink26(vm: AppViewModel) {
    val p = PaperPal.current
    val s = vm.bd24
    val sub = (if (s.google.connected) "Google: ${s.google.email ?: "koblet til"}" else "Google ikke koblet") + " · " +
        (if (s.ha.entityId != null && s.ha.syncedAt != null) "HA: ${s.ha.entityId}" else "Home Assistant ikke importert")
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(p.card).clickable(role = Role.Button) { vm.openKalSettings26("bd") }.padding(16.dp, 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text("Kalendere", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            Text(sub, color = p.mut, fontSize = 12.5.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Text("Innstillinger ›", color = p.mut, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}
