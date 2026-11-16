package no.kristo.finanshub.skjerm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import no.kristo.finanshub.Api
import no.kristo.finanshub.Day
import no.kristo.finanshub.MatFolder
import no.kristo.finanshub.RecipeJob
import no.kristo.finanshub.RecipePreview
import no.kristo.finanshub.Week
import no.kristo.finanshub.repository.MatRepository
import no.kristo.finanshub.repository.MatUke

/** Det Mat-siden viser: uka med handlelisten, mappene, skannekøen og en importert oppskrift som venter på «Lagre». */
data class MatTilstand(
    val uke: Week? = null,
    val mapper: List<MatFolder> = emptyList(),
    val jobber: List<RecipeJob> = emptyList(),
    val forhandsvisning: RecipePreview? = null,
    val oppskriftOpptatt: Boolean = false,
)

/**
 * Mat (Struktur: Android, ViewModel per skjerm, samme mønster som DomenerViewModel). Tilstanden og nettkallene lå i
 * AppViewModel; der står nå bare tynne videresendinger (week, matFolders, recipeJobs, loadWeek, planWeek …). Valgt dag,
 * mappe og åpen rett (matDay, matFolderSel, dishOpen) er navigasjon og blir i AppViewModel, og det som trenger telefonen
 * (lese filer, åpne en fil i en annen app) gjøres der før kallet sendes hit.
 *
 * [melding] er appens korte melding med haptikk (flash), [feil] den felles feilhåndteringen. [uka] kalles når uka er
 * lastet, med rå-svaret («Endret av …» i domene/Mat.kt).
 */
class MatViewModel(
    private val repo: MatRepository,
    private val melding: (String) -> Unit,
    private val feil: (Exception) -> Unit,
    private val uka: (String) -> Unit,
) : ViewModel() {

    private val _tilstand = MutableStateFlow(MatTilstand())
    val tilstand: StateFlow<MatTilstand> = _tilstand.asStateFlow()

    private var jobbPoll: Job? = null

    private fun start(block: suspend () -> Unit): Job = viewModelScope.launch {
        try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { feil(e) }
    }

    /** Uka, mappene og skannekøen. Kaster videre, så siden kan vise modulfeilen (AppViewModel.loadFor). */
    suspend fun last() {
        val u: MatUke = repo.uke()
        _tilstand.update { it.copy(uke = u.uke, mapper = u.mapper) }
        uka(u.raw)
        // Skannekøen stopper ikke uka.
        val j: List<RecipeJob>? = runCatching { repo.jobber() }.getOrNull()
        if (j != null) _tilstand.update { it.copy(jobber = j) }
    }

    /** Ny plan for hele uka. AppViewModel viser «opptatt» og meldingen (som før). */
    suspend fun planleggUka() {
        repo.planlegg(null)
        last()
    }

    fun planleggDag(dato: String): Job = start { repo.planlegg(dato); last() }

    fun settKokk(dato: String, kokk: String): Job = start { repo.settKokk(dato, kokk); last() }

    fun vekslFast(d: Day): Job = start { repo.settFast(d.date, !d.fixed); last() }

    fun vekslHandel(id: String): Job = start { repo.vekslHandel(id); last() }

    /** Legger ingrediensene som mangler i handlelisten. Gir hvor mange som ble lagt til. */
    suspend fun leggIHandlelisten(ting: List<String>): Int {
        val uke: Week? = _tilstand.value.uke
        val har: Set<String> = uke?.shopping?.map { it.text.lowercase() }?.toSet() ?: emptySet()
        val nye: List<String> = ting.filter { it.lowercase() !in har }
        val ukestart: String? = uke?.start?.takeIf { it.isNotBlank() }
        for (t in nye) repo.leggIHandlelisten(t, ukestart)
        last()
        return nye.size
    }

    fun importerOppskrift(adresse: String): Job = start {
        val u = adresse.trim().let { if (it.startsWith("http")) it else "https://$it" }
        _tilstand.update { it.copy(oppskriftOpptatt = true) }
        try {
            val p: RecipePreview = repo.importerOppskrift(u)
            _tilstand.update { it.copy(forhandsvisning = p) }
        } finally { _tilstand.update { it.copy(oppskriftOpptatt = false) } }
    }

    fun settForhandsvisning(p: RecipePreview?) {
        _tilstand.update { it.copy(forhandsvisning = p) }
    }

    fun lagreOppskrift(mappe: String?): Job = start {
        val p: RecipePreview = _tilstand.value.forhandsvisning ?: return@start
        _tilstand.update { it.copy(oppskriftOpptatt = true) }
        try {
            repo.lagreOppskrift(p, mappe)
            _tilstand.update { it.copy(forhandsvisning = null) }
            last()
            melding("${p.name.ifBlank { "Retten" }} er lagret")
        } finally { _tilstand.update { it.copy(oppskriftOpptatt = false) } }
    }

    /** Skann oppskrift: filene er lest og skalert ned på telefonen (AppViewModel.scanRecipes). */
    suspend fun skannOppskrifter(deler: List<Api.Part>) {
        for (d in deler) repo.skannOppskrift(d)
        melding(if (deler.size == 1) "✦ Oppskriften leses i bakgrunnen" else "✦ ${deler.size} oppskrifter leses i bakgrunnen")
        val j: List<RecipeJob>? = runCatching { repo.jobber() }.getOrNull()
        if (j != null) _tilstand.update { it.copy(jobber = j) }
        fulgSkannekoen()
    }

    /** Følger skannekøen (hvert 3. sekund i opptil 3 minutter) og laster uka når en oppskrift er ferdig. */
    private fun fulgSkannekoen() {
        if (jobbPoll?.isActive == true) return
        jobbPoll = viewModelScope.launch {
            repeat(60) {
                delay(3000)
                val j: List<RecipeJob> = runCatching { repo.jobber() }.getOrNull() ?: return@launch
                val for0: Int = _tilstand.value.jobber.count { it.active }
                _tilstand.update { it.copy(jobber = j) }
                if (j.count { it.active } < for0) runCatching { last() }
                if (j.none { it.active }) return@launch
            }
        }
    }

    fun provJobbIgjen(id: String): Job = start {
        repo.provJobbIgjen(id)
        val j: List<RecipeJob> = repo.jobber()
        _tilstand.update { it.copy(jobber = j) }
        fulgSkannekoen()
    }

    fun fjernJobb(id: String): Job = start {
        repo.fjernJobb(id)
        val j: List<RecipeJob> = repo.jobber()
        _tilstand.update { it.copy(jobber = j) }
    }

    fun nyMappe(navn: String): Job = start {
        val n: String = navn.trim().takeIf { it.isNotEmpty() } ?: return@start
        repo.nyMappe(n.take(40))
        val m: List<MatFolder> = repo.mapper()
        _tilstand.update { it.copy(mapper = m) }
    }

    fun endreMappe(id: String, navn: String): Job = start {
        repo.endreMappe(id, navn.trim().take(40))
        val m: List<MatFolder> = repo.mapper()
        _tilstand.update { it.copy(mapper = m) }
    }

    suspend fun slettMappe(id: String) {
        repo.slettMappe(id)
        last()
    }

    fun settRettensMappe(rett: String, mappe: String?): Job = start { repo.settRettensMappe(rett, mappe); last() }

    fun leggTilLenke(rett: String, tittel: String, adresse: String): Job = start {
        val u = adresse.trim().let { if (it.startsWith("http")) it else "https://$it" }
        repo.leggTilLenke(rett, tittel.trim().ifBlank { u }, u)
        last()
    }

    /** Filen er lest på telefonen (AppViewModel.uploadDishFile). */
    suspend fun lastOppFil(rett: String, deler: List<Api.Part>) {
        repo.lastOppFil(rett, deler)
        last()
    }

    fun fjernLenke(rett: String, lenke: String): Job = start { repo.fjernLenke(rett, lenke); last() }

    suspend fun fil(sti: String): ByteArray = repo.fil(sti)

    /** Utlogging og kontobytte: ingenting fra forrige bruker blir liggende. */
    fun nullstill() {
        jobbPoll?.cancel()
        _tilstand.update { MatTilstand() }
    }

    companion object {
        fun fabrikk(
            repo: MatRepository,
            melding: (String) -> Unit,
            feil: (Exception) -> Unit,
            uka: (String) -> Unit,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer { MatViewModel(repo, melding, feil, uka) }
        }
    }
}
