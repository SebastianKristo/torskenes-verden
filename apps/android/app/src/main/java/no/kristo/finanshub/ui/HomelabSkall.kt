package no.kristo.finanshub.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import no.kristo.finanshub.ui.designsystem.HomelabTheme

/*
 * Fase 5: navigasjonsskallet.
 *
 * Skjermene styres fortsatt av tilstand i AppViewModel (screen, paperPage, åpne ark …). Skallet oversetter:
 *  - Tilbake: vm.back() bruker tilbakestabelen (:felles Tilbakestabel, stegene står i AppViewModel). Systemets tilbake, kantsveipet
 *    og ‹-knappene går alle dit; Nav23Back gir den prediktive animasjonen (PredictiveBackHandler) for hele appen. vm.tilbakeRute
 *    er rute-id-en for laget tilbake lukker nå («rot» på Hjem).
 *    Et nytt ark eller en ny underside = et nytt Tilbakesteg på riktig plass i lista (øverst = ligger over alt), ikke en egen
 *    BackHandler i skjermen.
 *  - Innfelling på ett sted: [HomelabSkall] (Scaffold med WindowInsets.safeDrawing) gir innholdet PaddingValues. En skjerm som er
 *    flyttet til skallet, legger ikke på statusBarsPadding/navigationBarsPadding/imePadding selv.
 *
 * I bølge 1 brukes skallet ikke av de gamle skjermene (de har egen innfelling), så utseendet er uendret.
 */

/** Innfellingen skjermene skal holde seg unna (statuslinje, navigasjonslinje, utskjæring, tastatur). */
object Innfelling {
    val trygg: WindowInsets
        @Composable get() = WindowInsets.safeDrawing
}

/**
 * Rammen for en skjerm: Scaffold med tokenfarger og innfelling på ett sted. [innhold] får PaddingValues for toppfelt, bunnlinje
 * og systemfeltene. Bruk M3 TopAppBar/NavigationBar i [toppfelt]/[bunnlinje] når skjermen flyttes (bølge 2).
 */
@Composable
fun HomelabSkall(
    modifier: Modifier = Modifier,
    toppfelt: @Composable () -> Unit = {},
    bunnlinje: @Composable () -> Unit = {},
    flytende: @Composable () -> Unit = {},
    innhold: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        modifier = modifier,
        topBar = toppfelt,
        bottomBar = bunnlinje,
        floatingActionButton = flytende,
        containerColor = HomelabTheme.colors.surface,
        contentColor = HomelabTheme.colors.textPrimary,
        contentWindowInsets = Innfelling.trygg,
        content = innhold,
    )
}
