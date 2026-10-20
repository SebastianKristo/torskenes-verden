package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.ChatFact41

/** Prompt 41: faktakort under Glimt-svaret i Papir-stil (mono-etikett, verdien, kilden). */
@Composable
internal fun ChatFacts41(v: ChatV27, facts: List<ChatFact41>) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        facts.forEach { f ->
            val shape = RoundedCornerShape(12.dp)
            Column(
                Modifier.fillMaxWidth().clip(shape).background(v.card).border(1.dp, if (f.failed) v.line.copy(alpha = .6f) else v.line, shape)
                    .padding(horizontal = 12.dp, vertical = 9.dp)
                    .semantics { contentDescription = listOf(f.headLine, f.label, f.source).filter { it.isNotBlank() }.joinToString(", ") },
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(f.headLine.uppercase(), color = v.acc, fontFamily = PaperFonts.mono, fontWeight = FontWeight.SemiBold, fontSize = 10.sp,
                    letterSpacing = 1.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(f.label, color = if (f.failed) v.mut else v.ink, fontFamily = v.sans, fontWeight = if (f.failed) FontWeight.Medium else FontWeight.SemiBold,
                    fontSize = 14.sp, lineHeight = 19.sp)
                if (f.source.isNotBlank()) Text(f.source, color = v.mut, fontFamily = PaperFonts.mono, fontWeight = FontWeight.Medium, fontSize = 10.sp)
            }
        }
    }
}
