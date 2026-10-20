package no.kristo.finanshub.ui

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import no.kristo.finanshub.AppViewModel

/* ---------------- Subscription OS ---------------- */

// Prompt 42: den klassiske Subscription OS-skjermen (Material You) er slettet; Papir bruker Subs23.kt.
@Composable
internal fun SubsMobileScreen(vm: AppViewModel) {
    // Prompt 23: Papir bruker den nøyaktige kopien av Subscription OS (Subs23.kt). Her ligger den i PaneBox (23 dp toppmarg),
    // så den løftes 23 dp for å overlappe toppbildet. Ruter Paper.kt direkte til PaperSubs23, brukes lift = 0.
    PaperSubs23(vm, WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding(), lift = 23.dp)
}
