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
import no.kristo.finanshub.ApiException
import no.kristo.finanshub.NewsData
import no.kristo.finanshub.repository.NyheterRepository
import no.kristo.finanshub.repository.NyheterSvar

/** Det Nyheter-siden viser (sakene, kildene og innstillingene fra /api/rss). Én verdi, så siden tegnes fra én StateFlow. */
data class NyheterTilstand(
    val data: NewsData? = null,
    val kategori: String = "siste",
    val laster: Boolean = false,
    val feil: String? = null,
)

/**
 * Nyheter (Struktur: Android, ViewModel per skjerm, samme mønster som DomenerViewModel). Tilstanden og nettkallene lå i
 * AppViewModel; der står nå bare tynne videresendinger (news, newsCat, newsBusy, newsError, loadNews …) for kode som ikke
 * er flyttet. Om siden er åpen (newsOpen, newsSettings) er navigasjon og blir i AppViewModel.
 *
 * Valgt kategori ligger i [lagret] (SavedStateHandle), så den overlever prosessdød (P85 F).
 * [melding] og [feil] er appens felles melding og feilhåndtering (utløpt innlogging, «Ikke tilgjengelig» osv.).
 */
class NyheterViewModel(
    private val lagret: SavedStateHandle,
    private val repo: NyheterRepository,
    private val melding: (String) -> Unit,
    private val feil: (Exception) -> Unit,
) : ViewModel() {

    private val _tilstand = MutableStateFlow(NyheterTilstand(kategori = lagret.get<String>(KATEGORI) ?: "siste"))
    val tilstand: StateFlow<NyheterTilstand> = _tilstand.asStateFlow()

    private fun start(block: suspend () -> Unit): Job = viewModelScope.launch {
        try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { feil(e) }
    }

    private fun settLaster(laster: Boolean) {
        _tilstand.update { it.copy(laster = laster) }
    }

    /** Sakene i valgt kategori på nytt (etter en endring i kilder eller innstillinger). */
    private suspend fun lastPaNytt() {
        val svar: NyheterSvar = repo.saker(_tilstand.value.kategori)
        _tilstand.update { it.copy(data = svar.data) }
    }

    /**
     * Laster en kategori. Gir rå-svaret (tilleggene i domene/Nyheter.kt leser egne kategorier, interesser og ikoner fra det),
     * eller null når serveren svarte med feil; feilen står da i [NyheterTilstand.feil]. Andre feil kastes videre.
     */
    suspend fun last(kategori: String): String? {
        settKategori(kategori)
        settLaster(true)
        try {
            val svar: NyheterSvar = repo.saker(kategori, timeout = 8000)
            _tilstand.update { it.copy(data = svar.data, feil = null) }
            return svar.raw
        } catch (e: ApiException) {
            val tekst: String? = if (e.status == 404) "Nyheter finnes ikke på serveren ennå. Oppdater Homelab." else e.message
            _tilstand.update { it.copy(feil = tekst) }
            return null
        } finally {
            settLaster(false)
        }
    }

    fun settKategori(kategori: String) {
        lagret[KATEGORI] = kategori
        _tilstand.update { it.copy(kategori = kategori) }
    }

    /** Ikonene per fane endres lokalt (Ikonsok.kt) før serveren svarer. */
    fun settData(data: NewsData?) {
        _tilstand.update { it.copy(data = data) }
    }

    fun leggTilKilde(adresse: String): Job = start {
        val u = adresse.trim().let { if (it.startsWith("http")) it else "https://$it" }
        if (u.length >= 10) {
            settLaster(true)
            try {
                repo.leggTilKilde(u)
                melding("Kilden er lagt til")
                lastPaNytt()
            } finally { settLaster(false) }
        }
    }

    fun settKildekategori(id: String, kategori: String): Job = start {
        repo.settKildekategori(id, kategori)
        lastPaNytt()
    }

    fun fjernKilde(id: String): Job = start {
        repo.fjernKilde(id)
        lastPaNytt()
    }

    /** aiSummary eller aiCategorize. Vises med en gang, så hentes svaret fra serveren. */
    fun settInnstilling(navn: String, verdi: Boolean): Job {
        _tilstand.update { t -> t.copy(data = t.data?.let { if (navn == "aiSummary") it.copy(aiSummary = verdi) else it.copy(aiCategorize = verdi) }) }
        return start {
            repo.settInnstilling(navn, verdi)
            lastPaNytt()
        }
    }

    fun hentKildene(): Job = start {
        settLaster(true)
        try {
            repo.hentKildene()
            lastPaNytt()
        } finally { settLaster(false) }
    }

    /** Utlogging og kontobytte: ingenting fra forrige bruker blir liggende. */
    fun nullstill() {
        _tilstand.update { it.copy(data = null, feil = null, laster = false) }
    }

    companion object {
        private const val KATEGORI = "nyheter.kategori"

        fun fabrikk(
            lagret: SavedStateHandle,
            repo: NyheterRepository,
            melding: (String) -> Unit,
            feil: (Exception) -> Unit,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer { NyheterViewModel(lagret, repo, melding, feil) }
        }
    }
}
