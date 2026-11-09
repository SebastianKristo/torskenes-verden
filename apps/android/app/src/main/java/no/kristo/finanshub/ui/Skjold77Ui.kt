package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*

/*
 * Prompt 77 (SKJAIAND): smarte forslag i Skjold Lab – UI. Tilstand og API i Skjold77.kt.
 *  - SuggestBar77: «✦ Foreslå» ved navnet + kortet (navn, kategori med «ny», specs, tags – hver med ✓ – og «Bruk alle»).
 *  - FindImage77: «Finn bilde» ved bildene → rutenett med kandidater (miniatyrer via serverens proxy), forhåndsvisning, «Bruk bildet».
 *  - TidyScreen77: «Rydd opp med Glimt» – fremdrift, før → etter, avkrysning per del, «Godta valgte» og «Hopp over».
 *  - Settings77: «Finn bilder på nett» og «Foreslå automatisk når jeg tar bilde» (⚙ i Skjold Lab).
 */

/** Liten «Glimt tenker …» med spinner. */
@Composable
private fun Thinking77(text: String = THINK77) {
    val p = PaperPal.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CircularProgressIndicator(color = p.lab, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
        Text(text, color = p.sub, fontSize = 13.sp)
    }
}

/** Avkrysning (44 dp trykkflate). */
@Composable
private fun Check77(on: Boolean, desc: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Box(Modifier.size(44.dp).clip(CircleShape).clickable(role = Role.Checkbox, onClick = onClick).semantics { contentDescription = desc }, contentAlignment = Alignment.Center) {
        Box(Modifier.size(24.dp).clip(RoundedCornerShape(7.dp)).background(if (on) p.ink else Color.Transparent).border(1.5.dp, if (on) p.ink else p.line, RoundedCornerShape(7.dp)),
            contentAlignment = Alignment.Center) { if (on) Text("✓", color = p.bg, fontSize = 15.sp, fontWeight = FontWeight.Bold) }
    }
}

/* ---------------- ✦ Foreslå ---------------- */

/** Knappen ved navnet og kortet med forslaget (Ny/Endre del). */
@Composable
internal fun SuggestBar77(vm: AppViewModel, d: SkjDraft76) {
    val s = Skjold77
    val p = PaperPal.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.heightIn(min = 40.dp).clip(CircleShape).background(p.ink).clickable(role = Role.Button) { if (!s.sugBusy) vm.suggest77(d) }.padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center) { Text("✦ Foreslå", color = p.bg, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) }
            if (s.sugBusy) Thinking77()
            else if (s.sug == null) Text("Navn, kategori og specs fra bildet og teksten", color = p.mut, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 2)
        }
        s.sugErr?.let { Text(it, color = p.lab, fontSize = 13.sp) }
        s.sug?.let { SuggestCard77(d, it) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SuggestCard77(d: SkjDraft76, g: SkjSug77) {
    val s = Skjold77
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(p.surf2).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PLabel("✦ Glimt foreslår", modifier = Modifier.weight(1f))
            listOfNotNull(sourceText77(g.source), confText77(g.confidence)).joinToString(" · ").takeIf { it.isNotBlank() }?.let { Text(it, color = p.mut, fontSize = 12.sp, fontFamily = PaperFonts.mono) }
            Text("✕", color = p.mut, modifier = Modifier.size(36.dp).clip(CircleShape).clickable { s.sug = null }.wrapContentSize().semantics { contentDescription = "Lukk forslaget" })
        }
        g.name?.let { SugLine77("Navn", it, null, "name" in s.used || d.name == it) { applySug77(d, "name") } }
        g.category?.let { SugLine77("Kategori", it, if (g.categoryNew) "ny" else null, "category" in s.used || d.category == it) { applySug77(d, "category") } }
        g.specs.forEach { (k, v) ->
            SugLine77(k, v, null, "spec:$k" in s.used || d.specs.any { it.first.equals(k, true) && it.second == v }) { applySug77(d, "spec:$k") }
        }
        if (g.tags.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 4.dp)) {
            val have = d.tags.split(',').map { it.trim().lowercase() }.toSet()
            g.tags.forEach { t -> PChip(if ("tag:$t" in s.used || t.lowercase() in have) "✓ #$t" else "#$t", "tag:$t" in s.used || t.lowercase() in have) { applySug77(d, "tag:$t") } }
        }
        if (g.decoded.isNotEmpty()) Text(g.decoded.joinToString("  ·  "), color = p.sub, fontSize = 12.5.sp, fontFamily = PaperFonts.mono)
        g.why?.let { Text(it, color = p.mut, fontSize = 12.5.sp) }
        PButton("Bruk alle", Modifier.fillMaxWidth().padding(top = 4.dp), height = 44.dp) { applySug77(d) }
    }
}

@Composable
private fun SugLine77(label: String, value: String, badge: String?, done: Boolean, onUse: () -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f)) {
            PLabel(label, p.mut, 10.sp)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(value, color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                badge?.let { Text(it, color = p.onLab, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(p.lab).padding(6.dp, 1.dp)) }
            }
        }
        Check77(done, "Bruk $label: $value") { if (!done) onUse() }
    }
}

/* ---------------- Finn bilde ---------------- */

/** «Finn bilde» ved bildene + rutenettet med kandidater og forhåndsvisning. */
@Composable
internal fun FindImage77(vm: AppViewModel, d: SkjDraft76, modifier: Modifier = Modifier) {
    PButton("Finn bilde", modifier, kind = "line") { vm.findImages77(imgQuery77(Skjold77.sug?.name, d.name)) }
}

@Composable
internal fun ImagePicker77(vm: AppViewModel, d: SkjDraft76) {
    val s = Skjold77
    val p = PaperPal.current
    // Valgte bilder fra søket på en ny del (lagres når delen lagres).
    if (s.pendingImgs.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        s.pendingImgs.forEach { im ->
            Box {
                Img76(vm, im.thumbUrl, 300, Modifier.size(72.dp).clip(RoundedCornerShape(12.dp)))
                Text("✕", color = Color.White, fontSize = 12.sp, modifier = Modifier.align(Alignment.TopEnd).padding(3.dp).size(24.dp).clip(CircleShape).background(Color.Black.copy(alpha = .55f))
                    .clickable { s.pendingImgs = s.pendingImgs - im }.wrapContentSize().semantics { contentDescription = "Fjern bildet" })
            }
        }
        Text("Lagres sammen med delen", color = p.mut, fontSize = 12.sp)
    }
    if (!s.imgOpen) return
    PCard(shadow = true) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    PLabel("Finn bilde")
                    if (s.imgQ.isNotBlank()) Text("«${s.imgQ}»", color = p.ink, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text("✕", color = p.mut, modifier = Modifier.size(40.dp).clip(CircleShape).clickable { s.imgOpen = false; s.imgPick = null }.wrapContentSize().semantics { contentDescription = "Lukk bildesøket" })
            }
            if (s.imgBusy && s.imgPick == null) Thinking77("Søker etter bilder …")
            s.imgErr?.let { Text(it, color = p.lab, fontSize = 13.sp) }
            val pick = s.imgPick
            if (pick != null) {
                // Forhåndsvisning før lagring.
                Img76(vm, pick.previewUrl ?: pick.thumbUrl, 900, Modifier.fillMaxWidth().height(240.dp).clip(RoundedCornerShape(14.dp)), crop = false)
                Text(listOfNotNull(pick.title, pick.source, if (pick.width != null && pick.height != null) "${pick.width} × ${pick.height}" else null).joinToString(" · "),
                    color = p.mut, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PButton(if (s.imgBusy) "Lagrer …" else "Bruk bildet", Modifier.weight(1f)) { if (!s.imgBusy) vm.useImage77(d, pick) }
                    PButton("Tilbake", Modifier.weight(1f), kind = "line") { s.imgPick = null }
                }
            } else s.imgs.chunked(3).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { im ->
                        Box(Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button) { Haptics.select(); s.imgPick = im }
                            .semantics { contentDescription = "Velg bilde: " + (im.title ?: "kandidat") }) {
                            Img76(vm, im.thumbUrl, 300, Modifier.matchParentSize())
                        }
                    }
                    repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
            if (s.imgs.isNotEmpty() && pick == null) Text("Bildene hentes via serveren din. Trykk på et bilde for å se det større.", color = p.mut, fontSize = 12.sp)
        }
    }
}

/* ---------------- Rydd opp ---------------- */

@Composable
internal fun TidyScreen77(vm: AppViewModel) {
    val s = Skjold77
    val p = PaperPal.current
    val running = !tidyFinished77(s.tidyState)
    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 170.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item(key = "head") {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Glimt går gjennom delene én om gangen og foreslår bedre navn, kategori og specs. Ingenting endres før du godtar det.", color = p.mut, fontSize = 13.sp)
                    if (running) {
                        Thinking77("$THINK77 ${progress77(s.tidyDone, s.tidyTotal)}")
                        if (s.tidyTotal > 0) Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(p.surf2)) {
                            Box(Modifier.fillMaxWidth((s.tidyDone.toFloat() / s.tidyTotal).coerceIn(0f, 1f)).fillMaxHeight().background(p.lab))
                        }
                    } else if (s.tidyErr == null) Text("Ferdig · ${s.tidyItems.size} forslag", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    s.tidyErr?.let { Text(it, color = p.lab, fontSize = 13.sp) }
                }
            }
            if (s.tidyItems.isNotEmpty()) item(key = "all") {
                val all = s.tidyItems.filter { it.error == null }.map { it.partId }.toSet()
                PHead("Forslag", "${s.tidySel.size} valgt")
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    PChip("Velg alle", s.tidySel.containsAll(all) && all.isNotEmpty()) { s.tidyTouched = s.tidyTouched + all; s.tidySel = all }
                    PChip("Ingen", s.tidySel.isEmpty()) { s.tidyTouched = s.tidyTouched + all; s.tidySel = emptySet() }
                }
            }
            if (!running && s.tidyItems.isEmpty() && s.tidyErr == null) item(key = "none") { Text("Alt ser ryddig ut – Glimt har ingen forslag.", color = p.mut, fontSize = 14.sp) }
            items(s.tidyItems, key = { "t" + it.partId }) { t -> TidyRow77(t) }
        }
        Column(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().fillMaxWidth().background(p.bg).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PButton(if (s.tidyBusy) "Lagrer …" else "Godta valgte (${s.tidySel.size})", Modifier.fillMaxWidth(), height = 50.dp) { if (!s.tidyBusy) vm.applyTidy77() }
            PButton("Hopp over", Modifier.fillMaxWidth(), kind = "line", height = 44.dp) { closeTidy77() }
        }
    }
}

@Composable
private fun TidyRow77(t: SkjTidy77) {
    val s = Skjold77
    val p = PaperPal.current
    val on = t.partId in s.tidySel
    PCard(onClick = if (t.error == null) ({ toggleTidy77(t.partId) }) else null) {
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 12.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.Top) {
            if (t.error == null) Check77(on, "Godta forslaget for ${t.beforeName}") { toggleTidy77(t.partId) } else Spacer(Modifier.width(44.dp))
            Column(Modifier.weight(1f).padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                val newName = t.after.name?.takeIf { it != t.beforeName }
                Text(t.beforeName, color = if (newName != null) p.mut else p.ink, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    textDecoration = if (newName != null) TextDecoration.LineThrough else null)
                if (newName != null) Text("→ $newName", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                val newCat = t.after.category?.takeIf { it != t.beforeCat }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text((t.beforeCat ?: "Uten kategori") + (newCat?.let { " → $it" } ?: ""), color = p.sub, fontSize = 12.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (newCat != null && t.after.categoryNew) Text("ny", color = p.onLab, fontSize = 10.5.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(RoundedCornerShape(5.dp)).background(p.lab).padding(5.dp, 1.dp))
                }
                if (t.after.specs.isNotEmpty()) Text(t.after.specs.joinToString(" · ") { "${it.first}: ${it.second}" }, color = p.mut, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (t.after.tags.isNotEmpty()) Text(t.after.tags.joinToString(" ") { "#$it" }, color = p.mut, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                t.error?.let { Text(it, color = p.lab, fontSize = 12.sp) }
            }
            confText77(t.confidence)?.let { Text(it, color = p.mut, fontFamily = PaperFonts.mono, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp)) }
        }
    }
}

/* ---------------- ⋯-meny og innstillinger ---------------- */

/** ⋯ i lista: «Rydd opp med Glimt» (alle, eller treffene når det søkes/filtreres) og innstillingene. */
@Composable
internal fun Menu77(vm: AppViewModel) {
    val s = Skjold77
    val s6 = Skjold76
    val p = PaperPal.current
    if (!s.menuOpen) return
    val filtered = s6.q.isNotBlank() || s6.cat != null || s6.low || s6.filterCab != null
    val hits = s6.items.orEmpty().map { it.id }
    Box(Modifier.fillMaxSize().clickable(remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, null) { s.menuOpen = false }) {
        Column(Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(top = 56.dp, end = 12.dp).widthIn(min = 240.dp, max = 320.dp)
            .shadow(12.dp, RoundedCornerShape(16.dp)).clip(RoundedCornerShape(16.dp)).background(p.pop).padding(vertical = 6.dp)) {
            MenuItem77("✦ Rydd opp med Glimt", if (filtered) "Alle delene" else "Alle ${s6.total} delene") { vm.startTidy77(null) }
            if (filtered && hits.isNotEmpty()) MenuItem77("✦ Rydd opp i treffene", "${hits.size} valgte deler") { vm.startTidy77(hits) }
            MenuItem77("⚙ Innstillinger", "Bilder på nett og auto-forslag") { s.menuOpen = false; s.settingsOpen = true; vm.loadAiSettings77() }
        }
    }
}

@Composable
private fun MenuItem77(t: String, sub: String, onClick: () -> Unit) {
    val p = PaperPal.current
    Column(Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button) { Haptics.tap(); onClick() }.padding(16.dp, 8.dp)) {
        Text(t, color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Text(sub, color = p.mut, fontSize = 12.sp)
    }
}

/** Arket med innstillingene (⚙ i Skjold Lab / Innstillinger → Moduler → Skjold Lab). */
@Composable
internal fun Settings77(vm: AppViewModel) {
    val s = Skjold77
    val p = PaperPal.current
    if (!s.settingsOpen) return
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .4f)).clickable { s.settingsOpen = false }, contentAlignment = Alignment.BottomCenter) {
        Column(Modifier.fillMaxWidth().widthIn(max = 560.dp).clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)).background(p.bg)
            .clickable(remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, null) {}.navigationBarsPadding().padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            PSerif("Skjold Lab · Glimt", 22.sp)
            Toggle77("Finn bilder på nett", "Søk etter bilder av delen via SearXNG (Wikimedia Commons som reserve). Bildene hentes av serveren.", s.webImages) { vm.putAiSettings77(webImages = it) }
            Toggle77("Foreslå automatisk når jeg tar bilde", "Glimt foreslår navn, kategori og specs når delen får et bilde. Du godtar selv hva som brukes.", s.autoSuggest) { vm.putAiSettings77(autoSuggest = it) }
            LedSettings78(vm) // prompt 78: lys opp skuffen
            Text("Gjenkjenningen kjører med den lokale modellen (AI-kontroll → Oppgaver → «Skjold Lab · gjenkjenning»).", color = p.mut, fontSize = 12.sp)
            PButton("Ferdig", Modifier.fillMaxWidth()) { s.settingsOpen = false }
        }
    }
}

@Composable
private fun Toggle77(t: String, sub: String, on: Boolean, onChange: (Boolean) -> Unit) {
    val p = PaperPal.current
    Row(Modifier.fillMaxWidth().clickable(role = Role.Switch) { onChange(!on) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {
            Text(t, color = p.ink, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text(sub, color = p.mut, fontSize = 12.5.sp)
        }
        Switch(on, onChange)
    }
}
