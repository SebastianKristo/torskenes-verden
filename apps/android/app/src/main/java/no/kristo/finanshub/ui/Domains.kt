package no.kristo.finanshub.ui

import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import no.kristo.finanshub.ui.designsystem.HomelabType
import no.kristo.finanshub.ui.designsystem.HomelabTheme

/**
 * Domener (Cloudflare-statistikk) i rosa tonal palett. Fanelinja er byttet ut med
 * Trafikk, Besøk, Ytelse og Sikkerhet; på brettbar vises fanene øverst.
 */
@Composable
internal fun DomainsScreen(vm: AppViewModel, twoPane: Boolean, section: String? = null) {
    val farger = HomelabTheme.colors
    val a = vm.analytics
    Page {
        // Papir har egen fanelinje (Oversikt, Publikum, Ytelse og Infra) og et hvitt toppkort med domenevelger og periode.
        item { PaperDomTop(vm) }
        // Prompt 38: Glimt-knappen (✦ nede til høyre) åpner oppsummeringen øverst på Oversikt.
        if (section == "oversikt" && vm.p38.domSumOpen && !vm.domAll) item { DomGlimt38(vm) }
        else if (section == null || section == "oversikt") item { DomainHeader(vm) }
        if (twoPane && section == null) item {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(farger.surfaceRaised).padding(4.dp)) {
                DomTab.entries.forEach { t ->
                    val on = vm.domTab == t
                    Box(Modifier.weight(1f).clip(RoundedCornerShape(24.dp)).background(if (on) farger.surfaceChip else Color.Transparent).clickable { vm.domTab = t }.padding(12.dp), contentAlignment = Alignment.Center) {
                        Text(t.label, color = if (on) farger.textPrimary else farger.textSecondary, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        vm.moduleError?.let { e -> item { Empty(e) } }
        if (vm.domains?.isEmpty() == true) item {
            Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("Ingen domener ennå.", color = farger.textSecondary)
                Button(onClick = { vm.domainManager = true }, shape = RoundedCornerShape(24.dp), colors = ButtonDefaults.buttonColors(containerColor = farger.surfaceChip, contentColor = farger.textPrimary)) {
                    Icon(Icons.Filled.Add, null); Spacer(Modifier.width(8.dp)); Text("Legg til domene", fontWeight = FontWeight.SemiBold)
                }
            }
        }
        if (vm.domAll) { allDomains(vm); return@Page }
        if (a == null && vm.moduleError == null && vm.domains?.isEmpty() != true) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = farger.textPrimary) } }
        if (a != null) {
            if (a.mock) item { Text("Eksempeldata – legg inn Cloudflare-token i Homelab for ekte tall.", color = farger.textSecondary, fontSize = HomelabType.footnote.fontSize, modifier = Modifier.padding(start = 8.dp)) }
            when (section) {
                "oversikt" -> traffic(vm, a, withCard = false, ranges = false)
                "publikum" -> visits(vm, a)
                "ytelse" -> { perf(a, withUptime = false); item { Title("Sikkerhet") }; security(a) }
                "infra" -> infra(vm, a)
                else -> when (vm.domTab) {
                    DomTab.Traffic -> traffic(vm, a)
                    DomTab.Visits -> visits(vm, a)
                    DomTab.Perf -> perf(a)
                    DomTab.Security -> security(a)
                }
            }
        }
    }
}

/** Overskrift: domenevelgeren (bare ikonet, med statusprikk) og Oppdater står ved siden av profilbildet. */
@Composable
private fun DomainHeader(vm: AppViewModel) {
    val farger = HomelabTheme.colors
    var pick by remember { mutableStateOf(false) }
    ModuleHeader(vm, "Domener", actions = {
        Box {
            IconButton(onClick = { pick = true }) {
                Box {
                    Icon(Icons.Filled.Public, "Velg domene${vm.domain?.let { " (nå $it)" } ?: ""}", tint = farger.textPrimary)
                    Box(Modifier.align(Alignment.TopEnd).size(8.dp).clip(CircleShape).background(when (vm.analytics?.status) { null, "active" -> farger.success; "pending", "unknown" -> tc(0xFFF2C14E); else -> farger.danger }))
                }
            }
            DropdownMenu(expanded = pick, onDismissRequest = { pick = false }) {
                vm.domains?.forEach { d ->
                    DropdownMenuItem(text = { Column { Text(d.name, fontWeight = if (d.name == vm.domain) FontWeight.SemiBold else FontWeight.Normal); Text(sourceName(d.source), fontSize = HomelabType.footnote.fontSize, color = farger.textSecondary) } },
                        leadingIcon = { if (d.name == vm.domain) Icon(Icons.Filled.Check, null, tint = farger.textPrimary) else Spacer(Modifier.size(24.dp)) },
                        onClick = { pick = false; vm.pickDomain(d.name) })
                }
                HorizontalDivider()
                DropdownMenuItem(text = { Text("Administrer domener", color = farger.textPrimary, fontWeight = FontWeight.SemiBold) }, leadingIcon = { Icon(Icons.Filled.Add, null, tint = farger.textPrimary) },
                    onClick = { pick = false; vm.domainManager = true })
            }
        }
        IconButton(onClick = { vm.reloadDomain() }) { Icon(Icons.Filled.Refresh, "Oppdater", tint = farger.textPrimary) }
    })
}

private val statusText = mapOf("active" to "Aktiv", "down" to "Nede", "pending" to "Venter", "unknown" to "Ukjent")

/** Dager til en dato («2026-11-30» eller ISO-tid). */
private fun daysLeft(d: String?): Long? = runCatching { java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.now(), java.time.LocalDate.parse(d!!.take(10))) }.getOrNull()

private fun bytes(b: Double): String = when {
    b >= 1e9 -> String.format(java.util.Locale("nb", "NO"), "%.1f GB", b / 1e9)
    b >= 1e6 -> String.format(java.util.Locale("nb", "NO"), "%.1f MB", b / 1e6)
    else -> String.format(java.util.Locale("nb", "NO"), "%.0f kB", b / 1e3)
}

/* ---------------- Byggeklosser ---------------- */

@Composable
private fun PinkCard(modifier: Modifier = Modifier.fillMaxWidth(), shape: RoundedCornerShape = RoundedCornerShape(24.dp), content: @Composable ColumnScope.() -> Unit) =
    Column(modifier.clip(shape).background(HomelabTheme.colors.surfaceRaised).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)

@Composable
private fun Stat(label: String, value: String, modifier: Modifier, shape: RoundedCornerShape = RoundedCornerShape(20.dp)) {
    val farger = HomelabTheme.colors
    Column(modifier.clip(shape).background(farger.surfaceRaised).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = farger.textSecondary, fontSize = HomelabType.footnote.fontSize, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(value, fontFamily = Mono, fontSize = HomelabType.headline.fontSize, fontWeight = FontWeight.SemiBold, color = farger.textPrimary, maxLines = 1, softWrap = false)
    }
}

@Composable
private fun Title(text: String) = Text(text, color = HomelabTheme.colors.textPrimary, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 8.dp, top = 8.dp))

@Composable
private fun Bars(rows: List<Named>, unit: String = "", color: Color = HomelabTheme.colors.textPrimary) {
    val farger = HomelabTheme.colors
    if (rows.isEmpty()) { Text("Ingen data", color = farger.textSecondary, fontSize = HomelabType.subheadline.fontSize); return }
    val max = rows.maxOf { it.value }.coerceAtLeast(1.0)
    rows.take(8).forEach { r ->
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row { Text(r.name, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = HomelabType.callout.fontSize); Text(if (unit == "%") pct(r.value) else count(r.value) + unit, fontFamily = Mono, fontSize = HomelabType.subheadline.fontSize, color = farger.textSecondary) }
            Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(farger.line)) {
                Box(Modifier.fillMaxWidth((r.value / max).toFloat().coerceIn(0.02f, 1f)).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(color))
            }
        }
    }
}

/** Kurve med fylt område under (sparkline / historikk). */
@Composable
private fun Area(values: List<Double>, second: List<Double> = emptyList(), height: Int = 90, color: Color = HomelabTheme.colors.textPrimary) {
    val farger = HomelabTheme.colors
    Canvas(Modifier.fillMaxWidth().height(height.dp)) {
        fun path(v: List<Double>, fill: Boolean): Path? {
            if (v.size < 2) return null
            val max = (values + second).maxOrNull()?.coerceAtLeast(1.0) ?: 1.0
            val step = size.width / (v.size - 1)
            val p = Path()
            v.forEachIndexed { i, y ->
                val o = Offset(i * step, size.height - (y / max).toFloat() * size.height * .92f)
                if (i == 0) p.moveTo(o.x, o.y) else p.lineTo(o.x, o.y)
            }
            if (fill) { p.lineTo(size.width, size.height); p.lineTo(0f, size.height); p.close() }
            return p
        }
        path(values, true)?.let { drawPath(it, Brush.verticalGradient(listOf(color.copy(alpha = .35f), Color.Transparent))) }
        path(values, false)?.let { drawPath(it, color, style = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round)) }
        path(second, false)?.let { drawPath(it, farger.textSecondary.copy(alpha = .6f), style = Stroke(1.5.dp.toPx())) }
    }
}

@Composable
private fun RangeChips(vm: AppViewModel, options: List<Pair<String, String>>) {
    val farger = HomelabTheme.colors
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (k, n) ->
            FilterChip(selected = vm.domRange == k, onClick = { vm.setRange(k) }, label = { Text(n) },
                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = farger.surfaceChip, selectedLabelColor = farger.textPrimary, containerColor = farger.surfaceRaised, labelColor = farger.textSecondary))
        }
    }
}

@Composable
private fun KV(k: String, v: String, good: Boolean? = null) {
    val farger = HomelabTheme.colors
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(k, Modifier.weight(1f), color = farger.textSecondary)
        Text(v, fontWeight = FontWeight.Medium, color = when (good) { true -> farger.success; false -> farger.danger; null -> farger.textPrimary })
    }
}

/* ---------------- Faner ---------------- */

private fun androidx.compose.foundation.lazy.LazyListScope.traffic(vm: AppViewModel, a: Analytics, withCard: Boolean = true, ranges: Boolean = true) {
    item {
        val farger = HomelabTheme.colors
        // Ca. 20 % lavere enn før: mindre polstring, tall og kurve.
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp, 28.dp, 28.dp, 10.dp)).background(farger.surfaceChip).padding(18.dp, 14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(farger.success))
                Text("Live · ${vm.domain ?: "akkurat nå"}", color = farger.textPrimary, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Row(verticalAlignment = Alignment.Bottom) {
                Text(count(a.liveVisitors), color = farger.textPrimary, fontFamily = Mono, fontSize = HomelabType.title2.fontSize, fontWeight = FontWeight.SemiBold, lineHeight = 38.sp)
                Text(" besøkende", color = farger.textPrimary.copy(alpha = .75f), modifier = Modifier.padding(bottom = 5.dp))
            }
            Text("${count(a.liveRequests)} forespørsler · ${String.format(java.util.Locale("nb", "NO"), "%.1f", a.liveMb)} MB", color = farger.textPrimary.copy(alpha = .8f), fontSize = HomelabType.subheadline.fontSize)
            Area(a.liveSpark.ifEmpty { a.series.map { it.visitors } }, height = 42, color = farger.textPrimary)
        }
    }
    if (ranges) item { RangeChips(vm, listOf("24h" to "Siste 24 t", "today" to "I dag")) }
    item {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Stat("Besøk", count(a.visitors), Modifier.weight(1f), RoundedCornerShape(24.dp, 8.dp, 8.dp, 8.dp))
                Stat("Forespørsler", count(a.requests), Modifier.weight(1f), RoundedCornerShape(8.dp, 24.dp, 8.dp, 8.dp))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Stat("Dataoverføring", bytes(a.bytes), Modifier.weight(1f), RoundedCornerShape(8.dp, 8.dp, 8.dp, 24.dp))
                Stat("Land", "${a.countries.size}", Modifier.weight(1f), RoundedCornerShape(8.dp, 8.dp, 24.dp, 8.dp))
            }
        }
    }
    if (withCard) item { DomainCard(vm, a) }
    item { Title("Historikk") }
    if (ranges) item { RangeChips(vm, listOf("7d" to "7 d", "30d" to "30 d", "90d" to "90 d", "1y" to "1 år")) }
    item {
        val farger = HomelabTheme.colors
        PinkCard {
            Row { Text("Forespørsler", Modifier.weight(1f), color = farger.textPrimary); Text("bufret ${pct(a.cachedPct)}", color = farger.textSecondary, fontSize = HomelabType.subheadline.fontSize) }
            Area(a.series.map { it.requests }, a.series.map { it.cached }, height = 120)
            if (a.series.size >= 2) Row { Text(a.series.first().t.take(10), color = farger.textSecondary, fontSize = HomelabType.caption.fontSize, modifier = Modifier.weight(1f)); Text(a.series.last().t.take(10), color = farger.textSecondary, fontSize = HomelabType.caption.fontSize) }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.visits(vm: AppViewModel, a: Analytics) {
    item {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat("Besøk", count(a.visitors), Modifier.weight(1f), RoundedCornerShape(24.dp, 8.dp, 8.dp, 24.dp))
            Stat("Sidevisninger", count(a.pageviews), Modifier.weight(1f), RoundedCornerShape(8.dp))
            Stat("Land", "${a.countries.size}", Modifier.weight(1f), RoundedCornerShape(8.dp, 24.dp, 24.dp, 8.dp))
        }
    }
    item { VisitsMap(vm, a) }
    item { Title("Topp land") }
    item { PinkCard { Bars(a.countries.sortedByDescending { it.visitors }.map { Named(flag(it.iso2) + " " + it.name, it.visitors) }) } }
    item { Title("Enheter") }
    item { PinkCard { Bars(a.devices, "%") } }
    item { Title("Toppsider") }
    item { PinkCard { Bars(a.topPages) } }
    item { Title("Henvisere") }
    item { PinkCard { Bars(a.referrers) } }
    item { Title("Nettlesere") }
    item { PinkCard { Bars(a.browsers, "%") } }
}

/** Papir → Domener → Infra: oppetid i 90 dager, domeneinfo og DNS-poster. */
private fun androidx.compose.foundation.lazy.LazyListScope.infra(vm: AppViewModel, a: Analytics) {
    uptime(a)
    item { DomainCard(vm, a) }
    item { Title("DNS-poster") }
    item {
        val farger = HomelabTheme.colors
        PinkCard {
            if (a.dns.isEmpty()) Text("Ingen DNS-poster hentet", color = farger.textSecondary, fontSize = HomelabType.subheadline.fontSize)
            a.dns.take(30).forEach { r ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(r.type, fontFamily = Mono, fontSize = HomelabType.footnote.fontSize, color = farger.textPrimary, modifier = Modifier.width(52.dp))
                    Column(Modifier.weight(1f)) {
                        Text(r.name, fontSize = HomelabType.subheadline.fontSize, maxLines = 1, overflow = TextOverflow.Ellipsis, color = farger.textPrimary)
                        Text(r.content, fontFamily = Mono, fontSize = HomelabType.footnote.fontSize, color = farger.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (r.proxied) Text("Proxy", color = farger.success, fontSize = HomelabType.caption.fontSize)
                }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.uptime(a: Analytics) {
    item { Title("Oppetid siste 90 dager") }
    item {
        val farger = HomelabTheme.colors
        PinkCard {
            val days = a.uptime90.takeLast(90)
            Text(if (a.uptimePct > 0) pct(a.uptimePct) else "–", fontFamily = Mono, fontSize = HomelabType.title3.fontSize, color = farger.textPrimary)
            Row(Modifier.fillMaxWidth().height(28.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                days.forEach { u -> Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(1.dp)).background(if (u < 0) farger.line else if (u >= 0.999) farger.success else if (u >= 0.98) tc(0xFFF2C14E) else farger.danger)) }
            }
            if (days.isNotEmpty()) Row { Text("${days.size} dager siden", color = farger.textSecondary, fontSize = HomelabType.caption.fontSize, modifier = Modifier.weight(1f)); Text("I dag", color = farger.textSecondary, fontSize = HomelabType.caption.fontSize) }
            if (days.isEmpty()) Text("Ingen målinger ennå", color = farger.textSecondary, fontSize = HomelabType.subheadline.fontSize)
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.perf(a: Analytics, withUptime: Boolean = true) {
    item {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Stat("Bufret andel", pct(a.cachedPct), Modifier.weight(1f), RoundedCornerShape(24.dp, 8.dp, 8.dp, 8.dp))
                Stat("Median TTFB", "${a.ttfbP50.toInt()} ms", Modifier.weight(1f), RoundedCornerShape(8.dp, 24.dp, 8.dp, 8.dp))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Stat("p95 TTFB", "${a.ttfbP95.toInt()} ms", Modifier.weight(1f), RoundedCornerShape(8.dp))
                Stat("Fra opprinnelse", "${a.originMs.toInt()} ms", Modifier.weight(1f), RoundedCornerShape(8.dp))
            }
            Stat("Feilrate", pct(a.errorPct), Modifier.fillMaxWidth(), RoundedCornerShape(8.dp, 8.dp, 24.dp, 24.dp))
        }
    }
    item { Title("Statuskoder") }
    item {
        PinkCard {
            Bars(listOf(Named("2xx · OK", a.status2xx), Named("3xx · Omdirigert", a.status3xx), Named("4xx · Ikke funnet o.l.", a.status4xx), Named("5xx · Serverfeil", a.status5xx)))
        }
    }
    item { Title("Protokoll") }
    item { PinkCard { Bars(a.http, "%"); HorizontalDivider(color = HomelabTheme.colors.line); Bars(a.tls, "%") } }
    if (withUptime) uptime(a)
}

private fun androidx.compose.foundation.lazy.LazyListScope.security(a: Analytics) {
    item {
        val farger = HomelabTheme.colors
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(32.dp, 32.dp, 10.dp, 32.dp)).background(farger.surfaceChip).padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Trusler stoppet", color = farger.textPrimary.copy(alpha = .8f))
            Text(count(a.threatsTotal), color = farger.textPrimary, fontFamily = Mono, fontSize = HomelabType.largeTitle.fontSize, fontWeight = FontWeight.SemiBold)
        }
    }
    item { Title("Hva ble stoppet") }
    item { PinkCard { Bars(a.threatTypes) } }
    item { Title("Siste hendelser") }
    item {
        val farger = HomelabTheme.colors
        PinkCard {
            if (a.events.isEmpty()) Text("Ingen hendelser", color = farger.textSecondary, fontSize = HomelabType.subheadline.fontSize)
            a.events.take(10).forEach { e ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Chip(e.action, bg = if (e.action == "Blokkert") tc(0xFF4A1F25) else tc(0xFF4A3A1F), fg = if (e.action == "Blokkert") farger.danger else tc(0xFFF2C14E))
                    Column(Modifier.weight(1f)) {
                        Text(e.path.ifBlank { "/" }, fontFamily = Mono, fontSize = HomelabType.subheadline.fontSize, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${flag(e.country)} ${e.ip} · ${e.time.takeLast(8).take(5)}", color = farger.textSecondary, fontSize = HomelabType.footnote.fontSize)
                    }
                }
            }
        }
    }
    item { Title("Trusler per land") }
    item { PinkCard { Bars(a.countries.filter { it.threats > 0 }.sortedByDescending { it.threats }.map { Named(flag(it.iso2) + " " + it.name, it.threats) }, color = HomelabTheme.colors.danger) } }
    item { Title("Innstillinger") }
    item {
        PinkCard {
            KV("SSL/TLS-modus", a.sslMode ?: "–")
            KV("Alltid HTTPS", a.alwaysHttps?.let { if (it) "På" else "Av" } ?: "–", a.alwaysHttps)
            KV("Minimum TLS", a.minTls ?: "–")
            KV("DNSSEC", a.dnssec?.let { if (it) "På" else "Av" } ?: "–", a.dnssec)
            KV("Bot Fight Mode", a.botFight?.let { if (it) "På" else "Av" } ?: "–", a.botFight)
            KV("Sertifikat utløper", (a.certExpires ?: a.sslExpires)?.let { ddmm(it) + "." + it.take(4) } ?: "–")
        }
    }
    item { Title("DNS-poster") }
    item {
        val farger = HomelabTheme.colors
        PinkCard {
            if (a.dns.isEmpty()) Text("Ingen DNS-poster", color = farger.textSecondary, fontSize = HomelabType.subheadline.fontSize)
            a.dns.forEachIndexed { i, r ->
                if (i > 0) HorizontalDivider(color = farger.line)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(r.type, fontFamily = Mono, fontSize = HomelabType.footnote.fontSize, fontWeight = FontWeight.Bold, color = farger.textPrimary, modifier = Modifier.width(52.dp))
                    Column(Modifier.weight(1f)) {
                        Text(r.name, fontSize = HomelabType.callout.fontSize, maxLines = 1, overflow = TextOverflow.Ellipsis, color = farger.textPrimary)
                        Text(r.content, fontFamily = Mono, fontSize = HomelabType.footnote.fontSize, color = farger.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    Chip(if (r.proxied) "Proxy" else "Kun DNS", bg = if (r.proxied) farger.surfaceChip else farger.line, fg = if (r.proxied) farger.textPrimary else farger.textSecondary)
                }
            }
        }
    }
}

/** Trafikk → «Domene»: status, kilde, registrar, fornyelse, sertifikat, navnetjenere, IP, TLS og DNSSEC. */
@Composable
private fun DomainCard(vm: AppViewModel, a: Analytics) {
    val farger = HomelabTheme.colors
    val src = vm.domains?.firstOrNull { it.name == vm.domain }?.source ?: a.source
    val left = daysLeft(a.certExpires ?: a.sslExpires)
    PinkCard {
        Text("DOMENE", color = farger.textPrimary, fontSize = HomelabType.footnote.fontSize, fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp)
        KV("Status", statusText[a.status ?: "unknown"] ?: a.status ?: "–", when (a.status) { "active" -> true; "down" -> false; else -> null })
        KV("Statistikkilde", sourceName(src))
        KV("Registrar", a.registrar ?: "–")
        KV("Fornyes", a.renews?.let { ddmm(it) + "." + it.take(4) } ?: "–")
        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Text("SSL-sertifikat", Modifier.weight(1f), color = farger.textSecondary)
            Text(left?.let { "$it dager igjen" } ?: "–", fontWeight = FontWeight.Medium, color = when { left == null -> farger.textPrimary; left < 30 -> tc(0xFFF2C14E); else -> farger.success })
        }
        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Text("Navnetjenere", Modifier.weight(1f), color = farger.textSecondary)
            Column(horizontalAlignment = Alignment.End) {
                a.nameServers.ifEmpty { listOf("–") }.forEach { Text(it, fontFamily = Mono, fontSize = HomelabType.subheadline.fontSize, color = farger.textPrimary, maxLines = 1) }
            }
        }
        KV("IP", a.dns.firstOrNull { it.type == "A" }?.content ?: "–")
        KV("TLS", a.minTls?.let { "Minst $it" } ?: a.tls.firstOrNull()?.name ?: "–")
        KV("DNSSEC", a.dnssec?.let { if (it) "På" else "Av" } ?: "–", a.dnssec)
    }
}

/** Besøk → verdenskart. Landene lastes én gang (fra serveren, ellers jsDelivr). */
@Composable
private fun VisitsMap(vm: AppViewModel, a: Analytics) {
    val farger = HomelabTheme.colors
    LaunchedEffect(Unit) { vm.loadWorldMap() }
    val map = vm.worldMap
    val values = remember(a) { a.countries.mapNotNull { c -> c.iso3n?.let { it to (c.name to c.visitors) } }.toMap() }
    PinkCard {
        Text("BESØK PER LAND", color = farger.textPrimary, fontSize = HomelabType.footnote.fontSize, fontWeight = FontWeight.SemiBold, letterSpacing = 0.8.sp)
        when {
            map == null -> Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) { Text("Laster kartet …", color = farger.textSecondary, fontSize = HomelabType.subheadline.fontSize) }
            map.isEmpty() -> Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) { Text("Kartet kunne ikke lastes.", color = farger.textSecondary, fontSize = HomelabType.subheadline.fontSize) }
            else -> {
                WorldMap(map, values)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Få", color = farger.textSecondary, fontSize = HomelabType.caption.fontSize)
                    Box(Modifier.weight(1f).height(6.dp).clip(CircleShape).background(Brush.horizontalGradient(listOf(Color(0xFF4A2433), Color(0xFFFFB1C8)))))
                    Text("Mange", color = farger.textSecondary, fontSize = HomelabType.caption.fontSize)
                }
            }
        }
    }
}

/** Administrer domener: listen med «Fjern» og «Legg til domene» (domene + statistikkilde). Samme liste som i Homelab. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun DomainManagerSheet(vm: AppViewModel) {
    val farger = HomelabTheme.colors
    var name by rememberSaveable { mutableStateOf("") }
    var source by remember { mutableStateOf("cloudflare") }
    ModalBottomSheet(onDismissRequest = { vm.domainManager = false }, containerColor = farger.surfaceRaised) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp, 0.dp, 20.dp, 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Administrer domener", style = MaterialTheme.typography.titleLarge, color = farger.textPrimary)
            val list = vm.domains ?: emptyList()
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                if (list.isEmpty()) Text("Ingen domener ennå.", color = farger.textSecondary)
                list.forEachIndexed { i, d ->
                    Row(Modifier.fillMaxWidth().clip(itemShape(i, list.size)).background(farger.line).padding(16.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Filled.Language, null, tint = farger.textPrimary)
                        Column(Modifier.weight(1f)) {
                            Text(d.name, fontWeight = FontWeight.SemiBold, color = farger.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(sourceName(d.source), fontSize = HomelabType.footnote.fontSize, color = farger.textSecondary)
                        }
                        TextButton(onClick = { vm.removeDomain(d) }) { Text("Fjern", color = farger.danger, fontWeight = FontWeight.SemiBold) }
                    }
                }
            }
            Text("Legg til domene", color = farger.textPrimary, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
            OutlinedTextField(name, { name = it }, label = { Text("Domene") }, placeholder = { Text("eksempel.no") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Uri),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = farger.textPrimary, focusedLabelColor = farger.textPrimary, cursorColor = farger.textPrimary))
            Text("Statistikkilde", color = farger.textSecondary, fontSize = HomelabType.subheadline.fontSize)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                DOMAIN_SOURCES.forEach { (k, n) ->
                    FilterChip(selected = source == k, onClick = { source = k }, label = { Text(n) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = farger.surfaceChip, selectedLabelColor = farger.textPrimary, containerColor = farger.line, labelColor = farger.textSecondary))
                }
            }
            Button(onClick = { vm.addDomain(name, source); name = "" }, enabled = name.isNotBlank(), modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(26.dp),
                colors = ButtonDefaults.buttonColors(containerColor = farger.textPrimary, contentColor = Color(0xFF3F0D1F))) { Text("Legg til domene", fontWeight = FontWeight.Bold) }
            Text(if (source in DOMAIN_NEEDS_TOKEN) "Plausible og Umami trenger API-token. Legg det inn i Homelab på web etterpå."
                else "API-token (Cloudflare) legges inn i Homelab på web. Uten eget token brukes standard-tokenet.", color = farger.textSecondary, fontSize = HomelabType.footnote.fontSize)
        }
    }
}

/** Landskode (ISO 3166-1 alfa-2) → flagg-emoji. */
private fun flag(iso2: String): String {
    if (iso2.length != 2 || !iso2.all { it.isLetter() }) return ""
    val u = iso2.uppercase()
    return String(Character.toChars(0x1F1E6 + (u[0] - 'A'))) + String(Character.toChars(0x1F1E6 + (u[1] - 'A')))
}


/* ---------------- Papir: toppkortet og «Alle domener» som kort ---------------- */

/**
 * Toppkortet i Papir (hvitt, overlapper bildeheaderen): «DOMENE» med antall, domenene som en vannrett rad med kort
 * (kilde over navnet, valgt kort er svart, sideveis scroll med snap) og periodene 1t, 24t, 7d og 30d i full bredde.
 */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
internal fun PaperDomTop(vm: AppViewModel) {
    val p = HomelabTheme.colors
    val list = vm.domains ?: emptyList()
    val state = androidx.compose.foundation.lazy.rememberLazyListState()
    PCard(shadow = true) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PLabel("Domene · ${list.size}", modifier = Modifier.weight(1f))
                Text("⟳", color = p.textPrimary, fontSize = HomelabType.body.fontSize, modifier = Modifier.clip(CircleShape).clickable { vm.reloadDomain() }.padding(8.dp, 2.dp))
                Text("+ Legg til", color = p.accent, fontSize = HomelabType.footnote.fontSize, fontWeight = FontWeight.SemiBold, modifier = Modifier.clip(CircleShape).clickable { vm.domainManager = true }.padding(8.dp, 4.dp))
            }
            androidx.compose.foundation.lazy.LazyRow(
                state = state, flingBehavior = androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior(state),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    DomChip("Oversikt", "Alle domener", vm.domAll) { vm.showAllDomains() }
                }
                items(list.size) { i ->
                    val d = list[i]
                    DomChip(sourceName(d.source), d.name, !vm.domAll && d.name == vm.domain) { vm.pickDomainPaper(d.name) }
                }
            }
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, p.line, RoundedCornerShape(12.dp)).padding(3.dp)) {
                listOf("1h" to "1t", "24h" to "24t", "7d" to "7d", "30d" to "30d").forEach { (k, n) ->
                    val on = vm.domRange == k
                    Box(Modifier.weight(1f).height(34.dp).clip(RoundedCornerShape(9.dp)).background(if (on) p.textPrimary else Color.Transparent).clickable { Haptics.select(); vm.setRangePaper(k) },
                        contentAlignment = Alignment.Center) { Text(n, color = if (on) p.surface else p.textPrimary, fontWeight = FontWeight.SemiBold, fontSize = HomelabType.subheadline.fontSize) }
                }
            }
            // Prompt 43 (claude-code-domener-glimt-i-kortet.md): Glimt-raden nederst i kortet (orben, ikke figuren), følger perioden.
            if (!vm.p38.domSumOpen) DomGlimtRow43(vm)
        }
    }
}

@Composable
private fun DomChip(kicker: String, name: String, on: Boolean, onClick: () -> Unit) {
    val p = HomelabTheme.colors
    Column(
        Modifier.width(156.dp).clip(RoundedCornerShape(14.dp)).background(if (on) p.textPrimary else p.surfaceSunken).clickable(onClick = onClick).padding(12.dp, 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(kicker.uppercase(), color = if (on) p.surface.copy(alpha = .7f) else p.textTertiary, fontFamily = PaperFonts.mono, fontSize = HomelabType.caption.fontSize, maxLines = 1)
        Text(name, color = if (on) p.surface else p.textPrimary, fontFamily = PaperFonts.serif, fontSize = HomelabType.callout.fontSize, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** «Alle domener» på mobil: ett kort per domene (ingen tabell). */
private fun androidx.compose.foundation.lazy.LazyListScope.allDomains(vm: AppViewModel) {
    val list = vm.domains ?: emptyList()
    items(list.size) { i ->
        val d = list[i]
        val a = vm.domAllStats[d.name]
        val p = HomelabTheme.colors
        PCard(onClick = { vm.pickDomainPaper(d.name) }) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        PSerif(d.name, 18.sp, maxLines = 1)
                        Text(sourceName(d.source), color = p.textTertiary, fontSize = HomelabType.footnote.fontSize)
                    }
                    val st = a?.status ?: if (vm.domAllStats.containsKey(d.name)) "unknown" else null
                    if (st != null) Box(Modifier.clip(CircleShape).background(if (st == "active") p.success.copy(alpha = .15f) else p.accent.copy(alpha = .15f)).padding(10.dp, 3.dp)) {
                        Text(statusText[st] ?: st, color = if (st == "active") p.success else p.accent, fontSize = HomelabType.caption.fontSize, fontWeight = FontWeight.SemiBold)
                    }
                }
                if (a == null) Text(if (vm.domAllStats.containsKey(d.name)) "Fikk ikke hentet tall." else "Henter …", color = p.textTertiary, fontSize = HomelabType.footnote.fontSize)
                else {
                    Row(Modifier.fillMaxWidth()) {
                        listOf("Forespørsler" to count(a.requests), "Besøkende" to count(a.visitors), "Oppetid" to if (a.uptimePct > 0) pct(a.uptimePct) else "–").forEach { (k, v) ->
                            Column(Modifier.weight(1f)) {
                                Text(k, color = p.textTertiary, fontSize = HomelabType.caption.fontSize, maxLines = 1)
                                PSerif(v, 19.sp, maxLines = 1)
                            }
                        }
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    val ssl = daysLeft(a.certExpires ?: a.sslExpires)
                    Row {
                        Text("Bufret ${pct(a.cachedPct)}", color = p.textTertiary, fontSize = HomelabType.footnote.fontSize, modifier = Modifier.weight(1f))
                        Text(ssl?.let { "SSL utløper om $it d" } ?: "SSL –", color = if ((ssl ?: 99) < 14) p.accent else p.textTertiary, fontSize = HomelabType.footnote.fontSize)
                    }
                }
            }
        }
    }
}
