package no.kristo.finanshub.family

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Health Connect viser denne når brukeren spør hvorfor FinansHub vil lese helsedata. */
class HealthRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            // Prompt 85: kant-til-kant er påtvunget fra Android 15 – hold innholdet unna systemfeltene, og la siden rulle så
            // «Lukk» kan nås med stor skrift.
            Column(Modifier.fillMaxSize().background(Color(0xFFF3EFE6)).systemBarsPadding().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Spacer(Modifier.height(40.dp))
                Text("Helse i Homelab", color = Color(0xFF1B1A17), fontSize = 28.sp, fontWeight = FontWeight.Medium)
                Text(
                    "FinansHub leser bare de typene du slår på under Innstillinger → App → Helse og posisjon: skritt, puls og hvilepuls, " +
                        "søvn, og aktivitet og trening (aktive kalorier og treningsøkter), for i dag og de siste 7 dagene. Et sammendrag sendes " +
                        "til din egen homelab-server hvert 15. minutt, og vises bare for familien på serveren. Ingenting sendes til andre. " +
                        "Slår du av «Del helsedata», stopper synken og serveren sletter helsedataene dine.",
                    color = Color(0xFF1B1A17), fontSize = 15.sp,
                )
                Button(onClick = { finish() }) { Text("Lukk") }
            }
        }
    }
}
