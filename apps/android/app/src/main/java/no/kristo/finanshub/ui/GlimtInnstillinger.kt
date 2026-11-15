package no.kristo.finanshub.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import no.kristo.finanshub.*

/* ======================= AI og tolkning → GLIMT I SØKEFELTET ======================= */

@Composable
internal fun GlimtSearchSettings32b(vm: AppViewModel) {
    val s = vm.p32b
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Glimt i søkefeltet", modifier = Modifier.padding(start = 4.dp, top = 10.dp))
        PCard {
            SetRow(vm, 0, Icons.Filled.AutoAwesome, "Send til Chat etter", "Enkle oppgaver fullføres i søkefeltet. Tar svaret lengre tid, fortsetter det i Chat.", "${s.hsTimeout} s") { vm.nextHsTimeout32b() }
            PToggle("Lagre søkehistorikk", "Søk fra telefonen vises under «Nylige søk» på web. Bare du ser dem.", s.searchHist, top = true) { vm.setSearchHist32b(it) }
        }
    }
}
