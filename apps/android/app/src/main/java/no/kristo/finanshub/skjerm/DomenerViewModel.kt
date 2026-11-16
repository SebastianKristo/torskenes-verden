package no.kristo.finanshub.skjerm

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import no.kristo.finanshub.Analytics
import no.kristo.finanshub.DOMAIN_NEEDS_TOKEN
import no.kristo.finanshub.DomTab
import no.kristo.finanshub.DomainRef
import no.kristo.finanshub.MapCountry
import no.kristo.finanshub.repository.DomenerRepository

/** Alt Domener-siden viser. Én verdi, så siden tegnes fra én StateFlow. */
data class DomenerTilstand(
    val domener: List<DomainRef>? = null,
    val valgt: String? = null,
    val analyse: Analytics? = null,
    val fane: DomTab = DomTab.Traffic,
    val periode: String = "24h",
    /** «Alle domener» som kort (Papir), med tallene per domene. */
    val alle: Boolean = false,
    val alleTall: Map<String, Analytics?> = emptyMap(),
    val verdenskart: List<MapCountry>? = null,
)

/**
 * Domener (Struktur: Android, ViewModel per skjerm). Tilstanden og logikken lå i AppViewModel; der står nå bare tynne
 * videresendinger (domains, domain, analytics, pickDomain …) for kode som ikke er flyttet ennå.
 *
 * Valgt domene, fane, periode og «Alle domener» ligger i [lagret] (SavedStateHandle), så de overlever prosessdød (P85 F).
 * [melding] og [feil] er appens felles melding og feilhåndtering (utløpt innlogging, «Ikke tilgjengelig» osv.).
 */
class DomenerViewModel(
    private val lagret: SavedStateHandle,
    private val repo: DomenerRepository,
    private val melding: (String) -> Unit,
    private val feil: (Exception) -> Unit,
) : ViewModel() {

    private val _tilstand = MutableStateFlow(
        DomenerTilstand(
            valgt = lagret.get<String>(VALGT),
            fane = lagret.get<String>(FANE)?.let { n -> DomTab.entries.firstOrNull { it.name == n } } ?: DomTab.Traffic,
            periode = lagret.get<String>(PERIODE) ?: "24h",
            alle = lagret.get<Boolean>(ALLE) ?: false,
        ),
    )
    val tilstand: StateFlow<DomenerTilstand> = _tilstand.asStateFlow()

    private var kartJobb: Job? = null

    private fun start(block: suspend () -> Unit): Job = viewModelScope.launch {
        try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { feil(e) }
    }

    /** Domenene og analysen for det valgte. Kaster videre, så siden kan vise modulfeilen (AppViewModel.loadFor). */
    suspend fun last() {
        val liste = repo.domener()
        val v = _tilstand.value.valgt
        val valgt = if (v == null || liste.none { it.name == v }) liste.firstOrNull()?.name else v
        _tilstand.update { it.copy(domener = liste) }
        settValgt(valgt)
        lastAnalyse()
    }

    private suspend fun lastAnalyse() {
        val d = _tilstand.value.valgt ?: return
        val a = repo.analyse(d, _tilstand.value.periode)
        _tilstand.update { it.copy(analyse = a) }
    }

    fun velg(navn: String): Job {
        settValgt(navn)
        _tilstand.update { it.copy(analyse = null) }
        return start { lastAnalyse() }
    }

    fun settPeriode(periode: String): Job {
        lagret[PERIODE] = periode
        _tilstand.update { it.copy(periode = periode) }
        return start { lastAnalyse() }
    }

    fun settFane(fane: DomTab) {
        lagret[FANE] = fane.name
        _tilstand.update { it.copy(fane = fane) }
    }

    fun settAlle(alle: Boolean) {
        lagret[ALLE] = alle
        _tilstand.update { it.copy(alle = alle) }
    }

    fun settValgt(navn: String?) {
        lagret[VALGT] = navn
        _tilstand.update { it.copy(valgt = navn) }
    }

    fun oppdater(): Job = start { last(); melding("Oppdatert fra Cloudflare") }

    /** Administrer domener: samme liste som i Homelab. API-token legges inn på web. */
    fun leggTil(navn: String, kilde: String): Job = start {
        val n = navn.trim().lowercase().removePrefix("https://").removePrefix("http://").trimEnd('/')
        if (n.isNotBlank()) {
            repo.leggTil(n, kilde)
            settValgt(n)
            last()
            melding(if (kilde in DOMAIN_NEEDS_TOKEN) "$n lagt til. Legg inn API-token på web." else "$n lagt til")
        }
    }

    fun fjern(d: DomainRef): Job = start {
        repo.fjern(d.id)
        if (_tilstand.value.valgt == d.name) {
            settValgt(null)
            _tilstand.update { it.copy(analyse = null) }
        }
        last()
        melding("${d.name} fjernet")
    }

    /** Verdenskartet til Besøk (lastes én gang). */
    fun lastVerdenskart() {
        if (_tilstand.value.verdenskart != null || kartJobb?.isActive == true) return
        kartJobb = viewModelScope.launch {
            val kart = repo.verdenskart()
            _tilstand.update { it.copy(verdenskart = kart) }
        }
    }

    /** «Alle domener» i Papir: ett kort per domene, tallene hentes for de som mangler. */
    fun visAlle() {
        settAlle(true)
        val liste = _tilstand.value.domener ?: return
        val periode = _tilstand.value.periode
        for (d in liste) {
            if (_tilstand.value.alleTall.containsKey(d.name)) continue
            viewModelScope.launch {
                val a: Analytics? = try { repo.analyse(d.name, periode) } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
                _tilstand.update { it.copy(alleTall = it.alleTall + (d.name to a)) }
            }
        }
    }

    fun velgFraAlle(navn: String) {
        settAlle(false)
        velg(navn)
    }

    fun settPeriodeFraAlle(periode: String) {
        _tilstand.update { it.copy(alleTall = emptyMap()) }
        settPeriode(periode)
        if (_tilstand.value.alle) visAlle()
    }

    /** Utlogging og kontobytte: ingenting fra forrige bruker blir liggende. */
    fun nullstill() {
        settValgt(null)
        _tilstand.update { it.copy(domener = null, analyse = null, alleTall = emptyMap()) }
    }

    companion object {
        private const val VALGT = "domener.valgt"
        private const val FANE = "domener.fane"
        private const val PERIODE = "domener.periode"
        private const val ALLE = "domener.alle"

        fun fabrikk(
            lagret: SavedStateHandle,
            repo: DomenerRepository,
            melding: (String) -> Unit,
            feil: (Exception) -> Unit,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer { DomenerViewModel(lagret, repo, melding, feil) }
        }
    }
}
