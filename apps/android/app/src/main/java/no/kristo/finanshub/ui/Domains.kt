package no.kristo.finanshub.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
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

/**
 * Domener (Cloudflare-statistikk) i rosa tonal palett. Fanelinja er byttet ut med
 * Trafikk, Besøk, Ytelse og Sikkerhet; på brettbar vises fanene øverst.
 */
@Composable
internal fun DomainsScreen(vm: AppViewModel, twoPane: Boolean) {
    val a = vm.analytics
    Page {
        item { DomainHeader(vm) }
        if (twoPane) item {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(P.card).padding(4.dp)) {
                DomTab.entries.forEach { t ->
                    val on = vm.domTab == t
                    Box(Modifier.weight(1f).clip(RoundedCornerShape(24.dp)).background(if (on) P.hero else Color.Transparent).clickable { vm.domTab = t }.padding(12.dp), contentAlignment = Alignment.Center) {
                        Text(t.label, color = if (on) P.onHero else P.text2, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        vm.moduleError?.let { e -> item { Empty(e) } }
        if (vm.domains?.isEmpty() == true) item { Empty("Ingen domener ennå. Nye domener legges til i Homelab → Domener.") }
        if (a == null && vm.moduleError == null && vm.domains?.isEmpty() != true) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = P.accent) } }
        if (a != null) {
            if (a.mock) item { Text("Eksempeldata – legg inn Cloudflare-token i Homelab for ekte tall.", color = P.text2, fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp)) }
            when (vm.domTab) {
                DomTab.Traffic -> traffic(vm, a)
                DomTab.Visits -> visits(a)
                DomTab.Perf -> perf(a)
                DomTab.Security -> security(a)
            }
        }
    }
}

@Composable
private fun DomainHeader(vm: AppViewModel) {
    var pick by remember { mutableStateOf(false) }
    Column {
    ModuleHeader(vm, "Domener", actions = {
        IconButton(onClick = { vm.reloadDomain() }) { Icon(Icons.Filled.Refresh, "Oppdater", tint = P.accent) }
        IconButton(onClick = { vm.settingsPage = null; vm.go(Screen.Settings) }) { Icon(Icons.Filled.Settings, "Innstillinger", tint = P.text2) }
    })
    Spacer(Modifier.height(8.dp))
    Box {
        Row(Modifier.clip(RoundedCornerShape(20.dp)).background(P.card).clickable { pick = true }.padding(16.dp, 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(when (vm.analytics?.status) { null, "active" -> C.positive; "pending", "unknown" -> Color(0xFFF2C14E); else -> P.red }))
            Text(vm.domain ?: "Velg domene", fontWeight = FontWeight.SemiBold, color = P.onHero)
            Icon(Icons.Filled.ExpandMore, null, tint = P.text2)
        }
        DropdownMenu(expanded = pick, onDismissRequest = { pick = false }) {
            vm.domains?.forEach { d ->
                DropdownMenuItem(text = { Column { Text(d.name); Text(sourceName(d.source), fontSize = 12.sp, color = C.text2) } }, onClick = { pick = false; vm.pickDomain(d.name) })
            }
        }
    }
    }
}

private fun sourceName(s: String) = when (s) {
    "cloudflare" -> "Cloudflare zone analytics"; "tunnel" -> "Cloudflare Tunnel"; "plausible" -> "Plausible"; "umami" -> "Umami"; "uptime" -> "Bare oppetid og SSL"; else -> s
}

private fun bytes(b: Double): String = when {
    b >= 1e9 -> String.format(java.util.Locale("nb", "NO"), "%.1f GB", b / 1e9)
    b >= 1e6 -> String.format(java.util.Locale("nb", "NO"), "%.1f MB", b / 1e6)
    else -> String.format(java.util.Locale("nb", "NO"), "%.0f kB", b / 1e3)
}

/* ---------------- Byggeklosser ---------------- */

@Composable
private fun PinkCard(modifier: Modifier = Modifier.fillMaxWidth(), shape: RoundedCornerShape = RoundedCornerShape(24.dp), content: @Composable ColumnScope.() -> Unit) =
    Column(modifier.clip(shape).background(P.card).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)

@Composable
private fun Stat(label: String, value: String, modifier: Modifier, shape: RoundedCornerShape = RoundedCornerShape(20.dp)) {
    Column(modifier.clip(shape).background(P.card).padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = P.text2, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(value, fontFamily = Mono, fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = P.onHero, maxLines = 1, softWrap = false)
    }
}

@Composable
private fun Title(text: String) = Text(text, color = P.accent, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 8.dp, top = 8.dp))

@Composable
private fun Bars(rows: List<Named>, unit: String = "", color: Color = P.accent) {
    if (rows.isEmpty()) { Text("Ingen data", color = P.text2, fontSize = 13.sp); return }
    val max = rows.maxOf { it.value }.coerceAtLeast(1.0)
    rows.take(8).forEach { r ->
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row { Text(r.name, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 14.sp); Text(if (unit == "%") pct(r.value) else count(r.value) + unit, fontFamily = Mono, fontSize = 13.sp, color = P.text2) }
            Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(P.card2)) {
                Box(Modifier.fillMaxWidth((r.value / max).toFloat().coerceIn(0.02f, 1f)).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(color))
            }
        }
    }
}

/** Kurve med fylt område under (sparkline / historikk). */
@Composable
private fun Area(values: List<Double>, second: List<Double> = emptyList(), height: Int = 90, color: Color = P.accent) {
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
        path(second, false)?.let { drawPath(it, P.text2.copy(alpha = .6f), style = Stroke(1.5.dp.toPx())) }
    }
}

@Composable
private fun RangeChips(vm: AppViewModel, options: List<Pair<String, String>>) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (k, n) ->
            FilterChip(selected = vm.domRange == k, onClick = { vm.setRange(k) }, label = { Text(n) },
                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = P.hero, selectedLabelColor = P.onHero, containerColor = P.card, labelColor = P.text2))
        }
    }
}

@Composable
private fun KV(k: String, v: String, good: Boolean? = null) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(k, Modifier.weight(1f), color = P.text2)
        Text(v, fontWeight = FontWeight.Medium, color = when (good) { true -> C.positive; false -> P.red; null -> P.onHero })
    }
}

/* ---------------- Faner ---------------- */

private fun androidx.compose.foundation.lazy.LazyListScope.traffic(vm: AppViewModel, a: Analytics) {
    item {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(32.dp, 32.dp, 32.dp, 10.dp)).background(P.hero).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(C.positive))
                Text("Live · akkurat nå", color = P.onHero, fontWeight = FontWeight.SemiBold)
            }
            Row(verticalAlignment = Alignment.Bottom) {
                Text(count(a.liveVisitors), color = P.onHero, fontFamily = Mono, fontSize = 44.sp, fontWeight = FontWeight.SemiBold)
                Text(" besøkende", color = P.onHero.copy(alpha = .75f), modifier = Modifier.padding(bottom = 8.dp))
            }
            Text("${count(a.liveRequests)} forespørsler · ${String.format(java.util.Locale("nb", "NO"), "%.1f", a.liveMb)} MB", color = P.onHero.copy(alpha = .8f), fontSize = 14.sp)
            Area(a.liveSpark.ifEmpty { a.series.map { it.visitors } }, height = 56, color = P.onHero)
        }
    }
    item { RangeChips(vm, listOf("24h" to "Siste 24 t", "today" to "I dag")) }
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
    item { Title("Historikk") }
    item { RangeChips(vm, listOf("7d" to "7 d", "30d" to "30 d", "90d" to "90 d", "1y" to "1 år")) }
    item {
        PinkCard {
            Row { Text("Forespørsler", Modifier.weight(1f), color = P.onHero); Text("bufret ${pct(a.cachedPct)}", color = P.text2, fontSize = 13.sp) }
            Area(a.series.map { it.requests }, a.series.map { it.cached }, height = 120)
            if (a.series.size >= 2) Row { Text(a.series.first().t.take(10), color = P.text2, fontSize = 11.sp, modifier = Modifier.weight(1f)); Text(a.series.last().t.take(10), color = P.text2, fontSize = 11.sp) }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.visits(a: Analytics) {
    item {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat("Besøk", count(a.visitors), Modifier.weight(1f), RoundedCornerShape(24.dp, 8.dp, 8.dp, 24.dp))
            Stat("Sidevisninger", count(a.pageviews), Modifier.weight(1f), RoundedCornerShape(8.dp))
            Stat("Land", "${a.countries.size}", Modifier.weight(1f), RoundedCornerShape(8.dp, 24.dp, 24.dp, 8.dp))
        }
    }
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

private fun androidx.compose.foundation.lazy.LazyListScope.perf(a: Analytics) {
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
    item { PinkCard { Bars(a.http, "%"); HorizontalDivider(color = P.card2); Bars(a.tls, "%") } }
    item { Title("Oppetid siste 30 dager") }
    item {
        PinkCard {
            val days = a.uptime90.takeLast(30)
            Text(if (a.uptimePct > 0) pct(a.uptimePct) else "–", fontFamily = Mono, fontSize = 22.sp, color = P.onHero)
            Row(Modifier.fillMaxWidth().height(28.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                days.forEach { u -> Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(if (u >= 0.999) C.positive else if (u >= 0.98) Color(0xFFF2C14E) else P.red)) }
            }
            if (days.isEmpty()) Text("Ingen målinger ennå", color = P.text2, fontSize = 13.sp)
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.security(a: Analytics) {
    item {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(32.dp, 32.dp, 10.dp, 32.dp)).background(P.hero).padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Trusler stoppet", color = P.onHero.copy(alpha = .8f))
            Text(count(a.threatsTotal), color = P.onHero, fontFamily = Mono, fontSize = 40.sp, fontWeight = FontWeight.SemiBold)
        }
    }
    item { Title("Hva ble stoppet") }
    item { PinkCard { Bars(a.threatTypes) } }
    item { Title("Siste hendelser") }
    item {
        PinkCard {
            if (a.events.isEmpty()) Text("Ingen hendelser", color = P.text2, fontSize = 13.sp)
            a.events.take(10).forEach { e ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Chip(e.action, bg = if (e.action == "Blokkert") Color(0xFF4A1F25) else Color(0xFF4A3A1F), fg = if (e.action == "Blokkert") P.red else Color(0xFFF2C14E))
                    Column(Modifier.weight(1f)) {
                        Text(e.path.ifBlank { "/" }, fontFamily = Mono, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${flag(e.country)} ${e.ip} · ${e.time.takeLast(8).take(5)}", color = P.text2, fontSize = 12.sp)
                    }
                }
            }
        }
    }
    item { Title("Trusler per land") }
    item { PinkCard { Bars(a.countries.filter { it.threats > 0 }.sortedByDescending { it.threats }.map { Named(flag(it.iso2) + " " + it.name, it.threats) }, color = P.red) } }
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
}

/** Landskode (ISO 3166-1 alfa-2) → flagg-emoji. */
private fun flag(iso2: String): String {
    if (iso2.length != 2 || !iso2.all { it.isLetter() }) return ""
    val u = iso2.uppercase()
    return String(Character.toChars(0x1F1E6 + (u[0] - 'A'))) + String(Character.toChars(0x1F1E6 + (u[1] - 'A')))
}
