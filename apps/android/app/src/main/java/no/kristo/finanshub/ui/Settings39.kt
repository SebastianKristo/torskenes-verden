package no.kristo.finanshub.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.ViewWeek
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 39 (ANDROID39): Innstillinger
 *  - «Tilpass» (claude-code-innst-tilpass-side.md): IDENTITET (navn, ikon) og FANELINJE (stil, Hjem) øverst, deretter tema,
 *    ikonfarger, bakgrunn og resten av fanelinje-valgene fra den gamle «Utseende og fanelinje» (PaperSettings16, uendret logikk).
 *  - «Appprofil» (claude-code-innst-appprofil-underside.md): PROFIL-gruppen som egen underside nederst i APP.
 *  - «Varsle om nye versjoner» (claude-code-varsler-versjon-app-ikon.md) under Varsler, samme nøkkel (notify_updates).
 */

/** Tilpass: IDENTITET og FANELINJE øverst i lista. */
internal fun LazyListScope.tilpassHead39(vm: AppViewModel) {
    item { PLabel("Identitet", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
    item {
        PCard {
            SetRow(vm, 0, Icons.Filled.Edit, "Navn på appen", vm.appName, "Endre ›") { vm.appNameEdit = true }
            SetRow(vm, 1, Icons.Filled.Image, "App-ikon", APP_ICONS.firstOrNull { it.first == vm.appInfo.icon }?.second ?: "Homelab H· (standard)", "Endre ›", top = true) { vm.appIconEdit = true }
        }
    }
    item { PLabel("Fanelinje", modifier = Modifier.padding(start = 4.dp, top = 10.dp)) }
    item {
        PCard {
            ScanHomeRow41(vm) // Prompt 41: «Skanneknapp på Hjem» øverst i FANELINJE
            SetRow(vm, 2, Icons.Filled.ViewWeek, "Fanelinje-stil", navStyleSub25(), navStyleName25() + " ›", top = true) { vm.setNavStyle25(nextNavStyle25()) }
            SetRow(vm, 3, Icons.Filled.ViewWeek, "Fanelinje i Hjem", "Fjern, flytt, gi nytt navn og ikon · eller hold inne på fanelinjen", top = true) { vm.tabEdit = true }
        }
    }
}

/** Undertekst på raden «Appprofil»: valgt profil. */
internal fun profileName39(vm: AppViewModel): String =
    if (vm.b24.profile == "custom") "Egendefinert" else vm.b24.profiles.firstOrNull { it.key == vm.b24.profile }?.name ?: "Standard"

/** Undersiden «Appprofil»: VELG PROFIL (samme valg og logikk som før) og forklaringen. */
internal fun LazyListScope.profilPage39(vm: AppViewModel) {
    profileGroup24(vm)
    item {
        val p = PaperPal.current
        Text("En profil bestemmer hvilke faner og sider appen viser og hvor den åpner. Dataene dine endres ikke.",
            color = p.mut, fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 6.dp))
    }
}

/** Varsler: «Varsle om nye versjoner» (Nordlys OS · banner på Hjem og push). Bare admin har oppdateringsvalgene. */
@Composable
internal fun UpdNotifyToggle39(vm: AppViewModel) {
    if (!vm.userIsAdmin) return
    LaunchedEffect(Unit) { vm.loadUpdSettings30() }
    Column {
        PToggle("Varsle om nye versjoner", "Nordlys OS · banner på Hjem og push", vm.p30.upd.notifyUpdates, top = true) { vm.setUpdSetting30("notify_updates", it) }
    }
}
