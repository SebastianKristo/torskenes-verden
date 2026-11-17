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
import no.kristo.finanshub.ApiException
import no.kristo.finanshub.WX_PLACES
import no.kristo.finanshub.WeatherFull
import no.kristo.finanshub.WxCmp22
import no.kristo.finanshub.WxCompare
import no.kristo.finanshub.WxPlace
import no.kristo.finanshub.repository.VaerRepository
import no.kristo.finanshub.repository.VaerSvar
import no.kristo.finanshub.uiErr73

/** Det Vær-siden viser. Én verdi, så siden tegnes fra én StateFlow. */
data class VaerTilstand(
    /** Været for [sted] (null mens det hentes første gang). */
    val full: WeatherFull? = null,
    val feil: String? = null,
    /** Sted-id, eller «geo:lat,lon,navn» for Min posisjon og midlertidige steder fra AI-søket. */
    val sted: String = "oslo",
    val steder: List<WxPlace> = emptyList(),
    val sok: List<WxPlace> = emptyList(),
    val sokOpptatt: Boolean = false,
    /** Søket feilet (nett/server), og søket svarene gjelder (så «Fant ingen» ikke vises før søket er ferdig). */
    val sokFeilet: Boolean = false,
    val sokFerdigFor: String = "",
    /** «Yr og Pent» på værsiden. */
    val pent: WxCmp22? = null,
    val pentOpptatt: Boolean = false,
    val pentFeilet: Boolean = false,
    /** «Sammenlign Yr og Storm». */
    val sammenligning: WxCompare? = null,
    val sammenligningFeil: String? = null,
)

/**
 * Vær (Struktur: Android, ViewModel per skjerm, samme mønster som Nyheter og Sporing). Tilstanden og nettkallene lå i
 * AppViewModel; der står nå bare tynne videresendinger (weatherFull, weatherPlace, wxPlaces, loadWeather …), så Glimt,
 * Hjem, bakgrunnsbildet og værsidene leser det samme som før. Om siden og arkene er åpne (weatherOpen, weatherSheetDay,
 * wxPlacesSheet, compareOpen) er navigasjon og blir i AppViewModel. «Min posisjon», skiføret og «Vær nå»-bildet ligger
 * fortsatt i domene/Vaer.kt (de trenger posisjon, lagrede valg og bildelasteren).
 *
 * [feil] er appens felles feilhåndtering (utløpt innlogging, «Ikke tilgjengelig» osv.).
 */
class VaerViewModel(
    private val repo: VaerRepository,
    private val feil: (Exception) -> Unit,
) : ViewModel() {

    private val _tilstand = MutableStateFlow(VaerTilstand())
    val tilstand: StateFlow<VaerTilstand> = _tilstand.asStateFlow()

    /** Stedet «Yr og Pent» sist ble hentet for (så det ikke hentes på nytt for samme sted). */
    private var pentFor: String? = null
    private var sokJobb: Job? = null

    private fun start(block: suspend () -> Unit): Job = viewModelScope.launch {
        try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { feil(e) }
    }

    /** Været for et sted. Serverfeil står i [VaerTilstand.feil]; andre feil går til appens feilhåndtering. */
    fun last(sted: String): Job {
        _tilstand.update { it.copy(sted = sted, feil = null) }
        return start {
            try {
                val svar: VaerSvar = repo.full(sted)
                _tilstand.update { it.copy(full = svar.full) }
                lastPent(sted, svar.pent)
            } catch (e: ApiException) {
                val tekst: String? = if (e.status == 404) "Værappen trenger en nyere Homelab-server." else e.message
                _tilstand.update { it.copy(feil = tekst) }
            }
        }
    }

    /** compare fra /weather/full, ellers /weather/compare. Svarer ingen av dem: kortet sier at Pent ikke svarte. */
    private fun lastPent(sted: String, fraFull: WxCmp22?) {
        if (fraFull != null) {
            pentFor = sted
            _tilstand.update { it.copy(pent = fraFull, pentFeilet = false) }
            return
        }
        if (pentFor == sted && _tilstand.value.pent != null) return
        _tilstand.update { it.copy(pent = null, pentFeilet = false, pentOpptatt = true) }
        viewModelScope.launch {
            val c: WxCmp22? = runCatching { repo.pent(sted) }.getOrNull()
            if (_tilstand.value.sted == sted) {
                pentFor = sted
                _tilstand.update { it.copy(pent = c, pentFeilet = c == null) }
            }
            _tilstand.update { it.copy(pentOpptatt = false) }
        }
    }

    /** Brukerens steder. Feil: de fire faste stedene. */
    fun lastSteder(): Job = viewModelScope.launch {
        val l: List<WxPlace> = runCatching { repo.steder() }.getOrNull() ?: standardSteder()
        _tilstand.update { it.copy(steder = l) }
    }

    /** Stedssøk: minst 2 tegn, venter 250 ms på at du skriver ferdig. */
    fun sok(q: String) {
        sokJobb?.cancel()
        val t: String = q.trim()
        if (t.length < 2) {
            _tilstand.update { it.copy(sok = emptyList(), sokFeilet = false, sokFerdigFor = "", sokOpptatt = false) }
            return
        }
        sokJobb = viewModelScope.launch {
            delay(250)
            _tilstand.update { it.copy(sokOpptatt = true) }
            try {
                val treff: List<WxPlace> = repo.sok(t) ?: emptyList()
                _tilstand.update { it.copy(sok = treff, sokFeilet = false, sokFerdigFor = t, sokOpptatt = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _tilstand.update { it.copy(sok = emptyList(), sokFeilet = true, sokFerdigFor = t, sokOpptatt = false) }
            }
        }
    }

    /** Legger til et sted og henter listen på nytt. Gir true når serveren lagret det. */
    suspend fun leggTil(p: WxPlace): Boolean {
        val lagret: Boolean = runCatching { repo.leggTil(p) }.isSuccess
        val l: List<WxPlace> = runCatching { repo.steder() }.getOrNull() ?: (_tilstand.value.steder + p)
        _tilstand.update { it.copy(steder = l, sok = emptyList()) }
        return lagret
    }

    suspend fun fjern(id: String) {
        runCatching { repo.fjern(id) }
        _tilstand.update { t -> t.copy(steder = t.steder.filter { it.id != id }) }
    }

    /** Ny rekkefølge vises med en gang og lagres så på serveren. */
    fun settRekkefolge(list: List<WxPlace>): Job {
        _tilstand.update { it.copy(steder = list) }
        return viewModelScope.launch { runCatching { repo.settRekkefolge(list.map { it.id }) } }
    }

    /** «Sammenlign Yr og Storm» for stedet som vises. */
    fun sammenlign(): Job {
        _tilstand.update { it.copy(sammenligning = null, sammenligningFeil = null) }
        val sted: String = _tilstand.value.sted
        return viewModelScope.launch {
            try {
                val c: WxCompare = repo.sammenligning(sted)
                _tilstand.update { it.copy(sammenligning = c) }
            } catch (e: ApiException) {
                val tekst: String? = if (e.status == 404) "Sammenligning trenger en nyere Homelab-server." else e.message
                _tilstand.update { it.copy(sammenligningFeil = tekst) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _tilstand.update { it.copy(sammenligningFeil = uiErr73(e, "Fikk ikke hentet sammenligningen")) }
            }
        }
    }

    /** Utlogging og kontobytte: steder, søk og været fra forrige bruker blir ikke liggende. */
    fun nullstill() {
        sokJobb?.cancel()
        pentFor = null
        _tilstand.update { VaerTilstand() }
    }

    companion object {
        fun standardSteder(): List<WxPlace> = WX_PLACES.map { (id, n) -> WxPlace(id, n, 0.0, 0.0, "") }

        fun fabrikk(repo: VaerRepository, feil: (Exception) -> Unit): ViewModelProvider.Factory = viewModelFactory {
            initializer { VaerViewModel(repo, feil) }
        }
    }
}
