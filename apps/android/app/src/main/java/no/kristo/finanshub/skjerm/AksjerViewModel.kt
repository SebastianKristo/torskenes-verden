package no.kristo.finanshub.skjerm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import no.kristo.finanshub.Stocks
import no.kristo.finanshub.StocksX
import no.kristo.finanshub.repository.AksjerRepository
import no.kristo.finanshub.repository.AksjerSvar

/** Det Aksjer-siden viser: oversikten (også flisa i Mer) og detaljene. Én verdi, så siden tegnes fra én StateFlow. */
data class AksjerTilstand(
    val oversikt: Stocks? = null,
    val detaljer: StocksX? = null,
)

/**
 * Aksjer (Struktur: Android, ViewModel per skjerm, samme mønster som Nyheter og Sporing). Tilstanden og nettkallene lå
 * i AppViewModel; der står nå bare videresendinger (stocks, stocksX, syncStocks). Periode og delside (stockPeriod,
 * stockScreen) er navigasjon og blir i AppViewModel, og «opptatt» og meldingen etter synk vises der som før.
 */
class AksjerViewModel(private val repo: AksjerRepository) : ViewModel() {

    private val _tilstand = MutableStateFlow(AksjerTilstand())
    val tilstand: StateFlow<AksjerTilstand> = _tilstand.asStateFlow()

    private fun sett(svar: AksjerSvar) {
        _tilstand.update { it.copy(oversikt = svar.oversikt, detaljer = svar.detaljer) }
    }

    /** Aksjer-siden. Kaster videre, så siden kan vise modulfeilen (AppViewModel.loadFor). */
    suspend fun last() {
        sett(repo.portefolje())
    }

    /** Oversikten for Mer. Feil gir det som var. */
    suspend fun lastOversikt() {
        val s: Stocks = runCatching { repo.oversikt() }.getOrNull() ?: return
        _tilstand.update { it.copy(oversikt = s) }
    }

    /** «Synk nå». Kaster videre til appens feilhåndtering. */
    suspend fun synk() {
        sett(repo.synk())
    }

    /** Utlogging og kontobytte: ingen tall fra forrige bruker blir liggende (heller ikke detaljene). */
    fun nullstill() {
        _tilstand.update { AksjerTilstand() }
    }

    companion object {
        fun fabrikk(repo: AksjerRepository): ViewModelProvider.Factory = viewModelFactory {
            initializer { AksjerViewModel(repo) }
        }
    }
}
