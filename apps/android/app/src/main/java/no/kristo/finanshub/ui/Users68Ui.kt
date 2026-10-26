package no.kristo.finanshub.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import no.kristo.finanshub.*

/*
 * Prompt 68 (AND68, punkt 4): «Brukere og familie» som egen side under HUSSTAND, som `users` på web
 * (settings.js usersView65: Brukere · Logg inn som/eier · Brief og Glimt-figur · Familie · Sonevarsler).
 * Samler det appen hadde fra før, uten å fjerne noe – hver del finnes bare her:
 *   - Brukere · Logg inn som · Server · eier (bare admin)      ← Konto (Accounts44, ui/Ui44.kt)
 *   - Brief og Glimt-figur: standardfigur per bruker (admin)  ← Glimt-innstillingene (CharAdmin52, ui/Ui52B.kt)
 *   - Familie: åpne Familie og kart, sonevarsler under Varsler
 *   - Helse og posisjon (alle)                                ← egen side «healthpos» (HealthPosPage, ui/Health20.kt)
 * Konto og Glimt viser bare en lenkerad hit. Lenker: finanshub://settings/{familie|husstand|brukere-og-familie|users|helse},
 * finanshub://husstand og finanshub://brukere-og-familie (alias67 i G67.kt), og gamle «healthpos»-lenker.
 */

internal const val USERS68 = "users68"

/** Undertekst i menyen (admin ser også brukerne og Logg inn som). */
internal fun users68Sub(admin: Boolean): String =
    if (admin) "Brukere og Logg inn som · Glimt-figur per bruker · Familie · helse og posisjon" else "Familie, sonevarsler, helse og posisjon"

@Composable
internal fun Users68Page(vm: AppViewModel) {
    val admin = vm.userIsAdmin
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        // Brukere · Logg inn som og Server · eier (Accounts44 viser seg bare for admin, og ikke mens admin er logget inn som en annen).
        Accounts44(vm)
        if (admin && !vm.impersonating44) {
            PLabel("Brief og Glimt-figur", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
            CharAdmin52(vm)
        }
        PLabel("Familie", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            SetRow(vm, 0, Icons.Filled.MyLocation, "Familie og kart", "Posisjon, soner, innsjekk og helse for husstanden") { vm.openFamily() }
            SetRow(vm, 1, Icons.Filled.NotificationsActive, "Sonevarsler", "Når noen kommer til eller forlater en sone – under Varsler", top = true) { vm.settingsPage = "notify" }
        }
        // Helse og posisjon (Health Connect, datatyper, posisjonsdeling) – tidligere egen side «healthpos».
        HealthPosPage(vm)
    }
}

/** Lenkeraden på Konto og i Glimt-innstillingene. */
@Composable
internal fun Users68Link(vm: AppViewModel, sub: String, onGo: () -> Unit = { vm.settingsPage = USERS68 }) {
    PCard { SetRow(vm, 0, Icons.Filled.Groups, "Brukere og familie", sub) { onGo() } }
}
