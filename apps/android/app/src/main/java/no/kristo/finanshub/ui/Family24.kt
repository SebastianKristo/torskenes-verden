package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import java.time.Duration
import java.time.Instant

/*
 * Prompt 24: Familie – én person = én oppføring. Personkortet viser enhetene («iPhone 15 Pro · 82 % · nå»), og du kan
 * velge hvilken enhet som er kilden for posisjonen din («Automatisk» som standard). PUT /api/family/me/source.
 */

private fun fam24Count(m: FamMember): Int = maxOf(m.deviceCount, m.devices.size)

/** « · 2 enheter» etter stedet i Familien-listen når personen har flere enheter. */
internal fun fam24DevicesSuffix(m: FamMember): String = fam24Count(m).let { if (it > 1) " · $it enheter" else "" }

private fun fam24Ago(iso: String?): String {
    val min = runCatching { Duration.between(Instant.parse(iso!!), Instant.now()).toMinutes() }.getOrNull() ?: return "–"
    return when {
        min < 2 -> "nå"
        min < 60 -> "$min min siden"
        min < 60 * 24 -> "${min / 60} t siden"
        else -> "${min / (60 * 24)} d siden"
    }
}

@Composable
internal fun Fam24Devices(vm: AppViewModel, m: FamMember, isMe: Boolean) {
    val p = PaperPal.current
    val auto = m.sourceDevice == null
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PLabel("Enheter · ${fam24Count(m)}")
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.bg)) {
            if (isMe) Fam24DeviceRow("Automatisk", "Nyeste og mest nøyaktige posisjon", auto, top = false) { if (!auto) vm.b24SetSource(null) }
            m.devices.forEachIndexed { i, d ->
                val sub = listOfNotNull(d.battery?.let { "$it %" }, fam24Ago(d.lastSeen), if (d.isSource) "kilde" else null).joinToString(" · ")
                val on = if (isMe) m.sourceDevice == d.id else d.isSource
                Fam24DeviceRow(d.name, sub, on, top = isMe || i > 0, onClick = if (isMe) ({ if (m.sourceDevice != d.id) vm.b24SetSource(d.id) }) else null)
            }
        }
    }
}

@Composable
private fun Fam24DeviceRow(title: String, sub: String, on: Boolean, top: Boolean, onClick: (() -> Unit)?) {
    val p = PaperPal.current
    Column {
        if (top) Box(Modifier.fillMaxWidth().padding(start = 12.dp).height(1.dp).background(p.line))
        Row(
            Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(role = Role.RadioButton, onClick = onClick) else Modifier).padding(12.dp, 10.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(title, color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(sub, color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, fontFamily = PaperFonts.mono)
            }
            Box(
                Modifier.size(20.dp).clip(CircleShape).border(2.dp, if (on) p.ink else p.line, CircleShape).padding(4.dp).clip(CircleShape)
                    .background(if (on) p.ink else Color.Transparent),
            )
        }
    }
}
