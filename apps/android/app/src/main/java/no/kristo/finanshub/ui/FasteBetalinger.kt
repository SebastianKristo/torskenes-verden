package no.kristo.finanshub.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import no.kristo.felles.kontrakt.Betaling
import no.kristo.felles.kontrakt.FasteBetalinger
import no.kristo.finanshub.*
import no.kristo.finanshub.ui.designsystem.HomelabType

/*
 * Faste betalinger i Økonomi (Q4): én side med filtrene Abonnementer, Faste utgifter og Planlagte trekk, fra
 * GET /finans/api/faste-betalinger. Appen viser serverens label, neste trekk, dager igjen og månedssum, og regner ikke selv.
 * Alle funksjonene fra før finnes fortsatt: «Åpne Abonnementer» går til den fulle abonnementssiden (innsikt, historikk,
 * prøveperioder, legg til), «Rediger faste utgifter» til Faste utgifter, og «Sparing og planer» til kalenderen med saldoprognose.
 */

/** Tilstanden for siden (én app, én visning om gangen). */
internal object FasteSide {
    var data by mutableStateOf<FasteBetalinger?>(null)
    var filter by mutableStateOf("abonnementer")
    var feil by mutableStateOf<String?>(null)
    var laster by mutableStateOf(false)
}

/** Åpner Faste betalinger i Økonomi med et filter («abonnementer», «faste» eller «planlagte»). */
fun AppViewModel.openFaste(filter: String = FasteSide.filter) {
    FasteSide.filter = filter.takeIf { it in FasteBetalinger.FILTRE } ?: "abonnementer"
    if (!screen.isFinance) go(Screen.Home)
    openFinMerPage("faste")
    loadFaste()
}

fun AppViewModel.loadFaste() {
    if (FasteSide.laster) return
    FasteSide.laster = true
    FasteSide.feil = null
    launch30 {
        try {
            val raw: String = api30 { get("/faste-betalinger") }
            val d: FasteBetalinger? = FasteBetalinger.fra(raw)
            FasteSide.feil = if (d == null) "Fikk ikke lest Faste betalinger. Oppdater serveren." else null
            if (d != null) FasteSide.data = d
        } catch (e: ApiException) {
            FasteSide.feil = if (e.status == 404) "Faste betalinger trenger en nyere Homelab-server." else (e.message ?: "Fikk ikke hentet Faste betalinger.")
        } finally {
            FasteSide.laster = false
        }
    }
}

@Composable
internal fun PaperFaste(vm: AppViewModel, navBottom: Dp) {
    val p = PaperPal.current
    LaunchedEffect(Unit) { if (FasteSide.data == null) vm.loadFaste() }
    val d = FasteSide.data
    val valgt = FasteSide.filter
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, PAPER_BAR + 16.dp + navBottom),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (id in FasteBetalinger.FILTRE) {
                    val f = d?.filter(id)
                    PChip(f?.navn ?: filterNavn(id), valgt == id, f?.antall?.toString()) { FasteSide.filter = id }
                }
            }
        }
        FasteSide.feil?.let { e -> item { PCard { Text(e, color = p.mut, style = HomelabType.callout, modifier = Modifier.padding(16.dp)) } } }
        if (d == null) {
            if (FasteSide.feil == null) item { Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = p.ink) } }
            return@LazyColumn
        }
        val f = d.filter(valgt)
        item {
            PCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    PLabel(f?.navn ?: filterNavn(valgt))
                    val sum = if (valgt == "planlagte") (f?.sum ?: d.planlagtSum) else (f?.maned ?: 0.0)
                    PSerif(if (valgt == "planlagte") "${neg0(sum)} kr" else "${n0(sum)} kr/mnd", HomelabType.title2.fontSize)
                    val under = when (valgt) {
                        "planlagte" -> "${f?.antall ?: d.planlagte.size} trekk de neste ${f?.dager ?: d.planlagtDager} dagene"
                        else -> listOfNotNull(f?.ar?.let { "${n0(it)} kr i året" }, f?.aktive?.let { "$it aktive" }, f?.dubletter?.takeIf { it > 0 }?.let { "$it også under Abonnementer" }).joinToString(" · ")
                    }
                    if (under.isNotBlank()) Text(under, color = p.mut, style = HomelabType.footnote)
                }
            }
        }
        if (valgt == "planlagte") {
            item {
                PCard {
                    if (d.planlagte.isEmpty()) Text("Ingen planlagte trekk.", color = p.mut, style = HomelabType.callout, modifier = Modifier.padding(16.dp))
                    d.planlagte.forEachIndexed { i, t ->
                        PRow(t.navn, listOfNotNull(t.label, t.konto, t.kilde.takeIf { it.isNotBlank() }).joinToString(" · "), "${neg0(t.belop)} kr", serif = false, top = i > 0)
                    }
                }
            }
        } else {
            val liste = d.i(valgt)
            item {
                PCard {
                    if (liste.isEmpty()) Text("Ingen ${(f?.navn ?: filterNavn(valgt)).lowercase()} ennå.", color = p.mut, style = HomelabType.callout, modifier = Modifier.padding(16.dp))
                    liste.forEachIndexed { i, b -> BetalingRad(vm, b, i > 0) }
                }
            }
        }
        // Funksjonene fra de gamle sidene (abonnementssiden, Faste utgifter og planleggingen) nås herfra.
        item {
            PCard {
                when (valgt) {
                    "abonnementer" -> PRow("Åpne Abonnementer", "Innsikt, historikk, prøveperioder og legg til", serif = false) { vm.openFromFinMer(Screen.Sub) }
                    "faste" -> PRow("Rediger faste utgifter", "Legg til, endre og slett", serif = false) { vm.openFromFinMer(Screen.Fast) }
                    else -> PRow("Sparing og planer", "Kalender med saldoprognose og sparemål", serif = false) { vm.open51("plan") }
                }
            }
        }
    }
}

@Composable
private fun BetalingRad(vm: AppViewModel, b: Betaling, top: Boolean) {
    // Serverens tekst («Månedlig · neste trekk 20. nov.») og dager igjen; dubletter merkes, og telles ikke i summen.
    val dager = b.dagerIgjen?.let { if (it == 0) "i dag" else if (it == 1) "i morgen" else "om $it dager" }
    val sub = listOfNotNull(b.label.takeIf { it.isNotBlank() }, dager, b.dublettAv?.let { "også et abonnement" }, if (!b.aktiv) "pauset" else null).joinToString(" · ")
    PRow(b.navn, sub, "${n0(b.belop)} kr${b.perTekst}", serif = false, top = top) {
        if (b.kind == "abonnement") vm.openFromFinMer(Screen.Sub) else vm.openFromFinMer(Screen.Fast)
    }
}

private fun filterNavn(id: String): String = when (id) { "faste" -> "Faste utgifter"; "planlagte" -> "Planlagte trekk"; else -> "Abonnementer" }
