package no.kristo.finanshub.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.flow.distinctUntilChanged
import no.kristo.finanshub.*

/*
 * Prompt 50 (MEDAND50): Media på Android.
 *  - Poster50: ThumbHash-plassholder i plakatens farger med én gang (fast 2:3-flate, ingen hopp), så riktig bredde
 *    (320 i listen, 640 på detaljsiden – valgt fra srcset etter dp × tetthet) fra Img50 (minne → disk → nett).
 *    Detaljsiden viser 320-plakaten fra listen med en gang mens 640 lastes. Kallet avbrytes når plakaten scrolles forbi.
 *  - Prefetch50: forhåndslaster plakatene i de neste 2 radene av rutenettet.
 *  - Track50Line: sann status etter søk (P50Med.kt) med Velg manuelt · Start · Innstillinger → Media · Søk igjen.
 *  - MediaDiag50: Innstillinger → Media → Diagnostikk (bare admin), ledd 2–6 grønt/rødt.
 */

/** Bilde-URL for visningsbredden px (posterImg/srcset når den finnes, ellers fast bredde i /api/media/bilde-URL-en). */
internal fun posterUrl50(url: String?, img: MImg50?, px: Int): String? = img?.pick(px) ?: url?.let { bildeW50(it, px) }

@Composable
internal fun Poster50(vm: AppViewModel, url: String?, img: MImg50?, color: Long?, title: String, w: Dp, h: Dp, modifier: Modifier = Modifier, fallback: String? = null) {
    val ctx = LocalContext.current.applicationContext
    val px = with(LocalDensity.current) { w.roundToPx() }
    val target = remember(url, img, px) { posterUrl50(url, img, px) }
    val ph = remember(img?.hash) { ThumbHash50.bitmap(img?.hash) }
    // Lavere oppløsning som allerede ligger i minnet (listens 320) vises mens den større lastes.
    var bmp by remember(target) { mutableStateOf<Bitmap?>(Img50.cached(vm.base, target) ?: Img50.cached(vm.base, fallback) ?: img?.let { i -> listOf(320, 160, 640).firstNotNullOfOrNull { Img50.cached(vm.base, i.pick(it)) } }) }
    LaunchedEffect(target) {
        if (target != null && Img50.cached(vm.base, target) == null) Img50.load(ctx, vm.base, vm.account?.token, target, maxOf(px, 64) * 2)?.let { bmp = it }
    }
    val shape = RoundedCornerShape(8.dp)
    Box(modifier.size(w, h).clip(shape).background(color?.let { Color(it) } ?: Color(0xFF2E3B4A)), contentAlignment = Alignment.BottomStart) {
        val b = bmp
        when {
            b != null -> Image(b.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
            ph != null -> Image(ph.asImageBitmap(), null, contentScale = ContentScale.Crop, filterQuality = FilterQuality.High, modifier = Modifier.matchParentSize())
            else -> Text(title, color = Color.White.copy(alpha = .9f), fontFamily = PaperFonts.serif, fontSize = if (w < 70.dp) 9.sp else 13.sp, lineHeight = if (w < 70.dp) 10.sp else 15.sp,
                maxLines = 4, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(6.dp))
        }
    }
}

/** Fanart i banneret (1280) – fra cache når mulig. */
@Composable
internal fun rememberFanart50(vm: AppViewModel, url: String?, img: MImg50?): Bitmap? {
    val ctx = LocalContext.current.applicationContext
    val target = remember(url, img) { img?.pick(1280) ?: url }
    var bmp by remember(target) { mutableStateOf(Img50.cached(vm.base, target)) }
    LaunchedEffect(target) { if (target != null && bmp == null) Img50.load(ctx, vm.base, vm.account?.token, target, 1400)?.let { bmp = it } }
    return bmp
}

/** Forhåndslaster plakatene i de neste 2 radene (cols per rad) mens brukeren scroller. */
@Composable
internal fun Prefetch50(vm: AppViewModel, state: LazyGridState, items: List<MItem43>, cols: Int, cellW: Dp) {
    val ctx = LocalContext.current.applicationContext
    val px = with(LocalDensity.current) { cellW.roundToPx() }
    LaunchedEffect(items, cols, px) {
        snapshotFlow { state.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }.distinctUntilChanged().collect { last ->
            // Første rad i rutenettet er knapper/filtre (index 0), så element i ligger på index i + 1.
            val from = last.coerceAtLeast(0)
            val next = items.drop(from).take(cols * 2).mapNotNull { posterUrl50(it.poster, it.posterImg, px) }
            if (next.isNotEmpty()) Img50.prefetch(ctx, vm.base, vm.account?.token, next, px * 2)
        }
    }
}

/* ---------------- Sann status etter søk ---------------- */

private fun tone50(t: String, mut: Color): Color = when (t) { "ok" -> OK43; "dl" -> Color(0xFF3D7DD6); "warn" -> WARN43; "bad" -> RED43; else -> mut }

/** Statuslinja under episoden/filmen/sesongen. onManual åpner interaktivt søk for elementet. */
@Composable
internal fun Track50Line(vm: AppViewModel, t: MTrack50, onManual: (() -> Unit)?, modifier: Modifier = Modifier) {
    val p = PaperPal.current
    val c = tone50(t.tone, p.mut)
    val busy = !t.final && t.state in setOf("searching", "checking", "sent", "starting")
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.copy(alpha = .09f)).border(1.dp, c.copy(alpha = .35f), RoundedCornerShape(12.dp))
        .semantics { liveRegion = LiveRegionMode.Polite }.padding(12.dp, 9.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (busy) CircularProgressIndicator(Modifier.size(13.dp), color = c, strokeWidth = 2.dp)
            else Box(Modifier.size(8.dp).clip(CircleShape).background(c))
            Text(t.text, color = if (t.tone == "mut") p.ink else c, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.weight(1f))
        }
        t.detail?.takeIf { it.isNotBlank() }?.let { Text(it, color = p.mut, fontSize = 12.sp, lineHeight = 16.sp) }
        if (t.state == "downloading" && t.progress != null) Box(Modifier.fillMaxWidth().height(3.dp).clip(CircleShape).background(p.line)) {
            Box(Modifier.fillMaxHeight().fillMaxWidth(t.progress.coerceIn(0f, 1f)).background(c))
        }
        // Diagnostikken som serveren kjørte selv etter 60 s uten grab: det leddet som feilet.
        t.steps.filter { it.state == "fail" || it.state == "warn" }.take(2).forEach { st ->
            Text(listOfNotNull("${st.n?.let { "$it. " } ?: ""}${st.title}: ${st.text}", st.hint).joinToString(" – "), color = if (st.state == "fail") RED43 else WARN43, fontSize = 12.sp, lineHeight = 16.sp)
        }
        val acts = t.actions.filter { a -> when (a.optString("id")) { "manual" -> onManual != null; "start", "settings", "retry" -> true; else -> false } }
        if (acts.isNotEmpty()) Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            acts.forEach { a ->
                when (a.optString("id")) {
                    "manual" -> Btn43(a.optString("label").ifBlank { "Velg manuelt" }) { onManual?.invoke() }
                    "start" -> { val h = a.optString("hash"); val on = Med50.started[h] == true
                        Btn43(if (on) "Startet" else a.optString("label").ifBlank { "Start" }, dark = true, enabled = !on && h.isNotBlank()) { vm.startTorrent50(h, t.id) } }
                    "settings" -> Btn43("Innstillinger → Media") { vm.closeMedia43(); vm.openPaperPage("set"); vm.settingsPage = "media" }
                    "retry" -> Btn43(a.optString("label").ifBlank { "Søk igjen" }) { vm.retry50(t, a) }
                }
            }
        }
    }
}

/* ---------------- Innstillinger → Media → Diagnostikk (bare admin) ---------------- */

private fun stepColor50(s: String, mut: Color): Color = when (s) { "ok" -> OK43; "warn" -> WARN43; "fail" -> RED43; else -> mut }

@Composable
internal fun MediaDiag50(vm: AppViewModel) {
    val p = PaperPal.current
    if (!vm.userIsAdmin) return
    val d = Med50.diag
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        PLabel("Diagnostikk", modifier = Modifier.padding(start = 4.dp, top = 6.dp))
        Text("Kjører kjeden Sonarr/Radarr → indeksere → grab → nedlastingsklient → qBittorrent og viser hvor den stopper. Nøkler og passord vises aldri.",
            color = p.mut, fontSize = 12.5.sp, lineHeight = 17.sp, modifier = Modifier.padding(horizontal = 4.dp))
        PButton(if (Med50.diagBusy) "Kjører diagnostikk …" else if (d == null) "Kjør diagnostikk" else "Kjør på nytt", Modifier.fillMaxWidth(), kind = if (d == null) "ink" else "line") {
            if (!Med50.diagBusy) vm.runDiag50()
        }
        Med50.diagErr?.let { Text(it, color = RED43, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 4.dp)) }
        if (d != null) PCard {
            d.summary?.let { Text(it, color = if (d.ok) OK43 else RED43, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, modifier = Modifier.padding(14.dp, 12.dp, 14.dp, 4.dp)) }
            d.steps.forEachIndexed { i, st ->
                if (i > 0 || d.summary != null) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                DiagStep50(vm, st)
            }
        }
    }
}

@Composable
private fun DiagStep50(vm: AppViewModel, st: MStep50) {
    val p = PaperPal.current
    val c = stepColor50(st.state, p.mut)
    Column(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(10.dp).clip(CircleShape).background(c))
            Text("${st.n?.let { "$it. " } ?: ""}${st.title}", color = p.ink, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, modifier = Modifier.weight(1f))
            st.ms?.let { Text("$it ms", color = p.mut, fontFamily = PaperFonts.mono, fontSize = 11.sp) }
        }
        if (st.text.isNotBlank()) Text(st.text, color = if (st.state == "fail") RED43 else p.mut, fontSize = 12.5.sp, lineHeight = 17.sp, modifier = Modifier.padding(start = 20.dp))
        st.hint?.let { Text(it, color = p.ink, fontSize = 12.5.sp, lineHeight = 17.sp, modifier = Modifier.padding(start = 20.dp)) }
        // Ledd 5: nedlastingsklientene (vert, port, kategori, starttilstand, passord satt/ikke satt).
        st.raw.optJSONArray("clients")?.let { a ->
            for (i in 0 until a.length()) a.optJSONObject(i)?.let { cl ->
                val line = listOfNotNull(cl.s43("name"), listOfNotNull(cl.s43("host"), cl.i43("port")?.toString()).joinToString(":").ifBlank { null },
                    cl.s43("category")?.let { "kategori $it" }, cl.s43("initialState")?.let { "start: $it" }, cl.s43("password")?.let { "passord $it" }).joinToString(" · ")
                Text(line, color = if (cl.optBoolean("ok", true)) p.mut else RED43, fontFamily = PaperFonts.mono, fontSize = 11.5.sp, modifier = Modifier.padding(start = 20.dp))
            }
        }
        // Ledd 6: torrents som står stoppet/fast – stoppede kan startes herfra.
        st.raw.optJSONArray("torrents")?.let { a ->
            for (i in 0 until minOf(a.length(), 6)) a.optJSONObject(i)?.let { tr ->
                val hash = tr.s43("hash")
                Row(Modifier.padding(start = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(listOfNotNull(tr.s43("name"), tr.s43("state")).joinToString(" · "), color = p.mut, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (hash != null && tr.optJSONObject("action") != null) {
                        val on = Med50.started[hash] == true
                        Btn43(if (on) "Startet" else "Start", dark = true, enabled = !on) { vm.startTorrent50(hash, null) }
                    }
                }
            }
        }
    }
}
