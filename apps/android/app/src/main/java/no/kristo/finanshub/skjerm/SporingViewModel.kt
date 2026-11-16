package no.kristo.finanshub.skjerm

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
import no.kristo.finanshub.Shipment
import no.kristo.finanshub.TrackingData
import no.kristo.finanshub.repository.NySending
import no.kristo.finanshub.repository.SporingRepository

/** Det Sporing-siden viser: sendingene (med kilder og varselvalg) og arkivet. Én verdi, så siden tegnes fra én StateFlow. */
data class SporingTilstand(
    val data: TrackingData? = null,
    val arkiv: List<Shipment>? = null,
)

/**
 * Sporing (Struktur: Android, ViewModel per skjerm, samme mønster som DomenerViewModel). Dataene og nettkallene lå i
 * AppViewModel; der står nå bare tynne videresendinger (tracking, trkArchived, loadTracking, addTracking …). Valgt sending,
 * filter og fane (trkSel, trkFilter, trkTab) er navigasjon og blir i AppViewModel, og lokale varsler for nye hendelser
 * lages der (de trenger appens varselkanal og lagrede valg).
 *
 * [feil] er appens felles feilhåndtering (utløpt innlogging, «Ikke tilgjengelig» osv.).
 */
class SporingViewModel(
    private val repo: SporingRepository,
    private val feil: (Exception) -> Unit,
) : ViewModel() {

    private val _tilstand = MutableStateFlow(SporingTilstand())
    val tilstand: StateFlow<SporingTilstand> = _tilstand.asStateFlow()

    private fun start(block: suspend () -> Unit): Job = viewModelScope.launch {
        try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { feil(e) }
    }

    /** Sendingene på nytt. Kaster videre, så siden kan vise modulfeilen (AppViewModel.loadFor). */
    suspend fun last(): TrackingData {
        val t: TrackingData = repo.sendinger()
        _tilstand.update { it.copy(data = t) }
        return t
    }

    /** I bakgrunnen (forsiden, sanntid og hvert 5. minutt): feil vises ikke, og da står det som var. */
    suspend fun hentStille(): TrackingData? {
        val t: TrackingData = runCatching { repo.sendinger(timeout = 15_000) }.getOrNull() ?: return null
        _tilstand.update { it.copy(data = t) }
        return t
    }

    /** Arkivet hentes for seg. Feil gir det som var. */
    fun lastArkiv(): Job = viewModelScope.launch {
        val a: List<Shipment>? = runCatching { repo.arkiv() }.getOrNull()
        if (a != null) _tilstand.update { it.copy(arkiv = a) }
    }

    suspend fun leggTil(nummer: String, navn: String?, transportor: String?, ut: Boolean): NySending =
        repo.leggTil(nummer, navn, transportor, ut)

    suspend fun masse(ids: List<String>, handling: String) {
        repo.masse(ids, handling)
    }

    suspend fun sjekkHosFrakt() {
        repo.sjekkHosFrakt()
    }

    /** Varselvalg (found, out, pickup, delivered, delayed). Vises med en gang, så lagres det på serveren. */
    fun settVarsel(navn: String, verdi: Boolean): Job {
        _tilstand.update { t -> t.copy(data = t.data?.let { it.copy(prefs = it.prefs + (navn to verdi)) }) }
        return start { repo.settVarsel(navn, verdi) }
    }

    /** Kildene finn, email og autoArchive. Vises med en gang, så lagres det på serveren. */
    fun settKilde(navn: String, verdi: Boolean): Job {
        _tilstand.update { t ->
            t.copy(data = t.data?.let {
                when (navn) {
                    "finn" -> it.copy(finn = it.finn.copy(on = verdi))
                    "autoArchive" -> it.copy(autoArchive = it.autoArchive.copy(on = verdi))
                    else -> it.copy(email = it.email.copy(on = verdi))
                }
            })
        }
        return start { repo.settKilde(navn, verdi) }
    }

    /** For kode som ennå endrer sendingene direkte (videresendingen tracking = … i AppViewModel). */
    fun settData(data: TrackingData?) {
        _tilstand.update { it.copy(data = data) }
    }

    /** Utlogging og kontobytte: ingenting fra forrige bruker blir liggende. */
    fun nullstill() {
        _tilstand.update { SporingTilstand() }
    }

    companion object {
        fun fabrikk(repo: SporingRepository, feil: (Exception) -> Unit): ViewModelProvider.Factory = viewModelFactory {
            initializer { SporingViewModel(repo, feil) }
        }
    }
}
