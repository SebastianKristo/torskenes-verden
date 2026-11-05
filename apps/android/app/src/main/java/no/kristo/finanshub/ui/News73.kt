package no.kristo.finanshub.ui

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import no.kristo.finanshub.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * Prompt 73 (NEWS73): lagre artikler offline (claude-code-nyheter-lagre-artikkel.md, fasit «Lagre og logo.dc.html» 1c og 1d).
 * Serveren henter hele artikkelen og bildene (/api/news/saved, per bruker, synkes med web og iOS). Appen lagrer i tillegg en
 * lokal kopi (GET /api/news/saved/:id?offline=1, bildene som data:-URI-er) i filesDir/news73, så artiklene kan leses uten nett.
 * Teksten vises som egne blokker (ingen WebView, ingen HTML). Fanen «Lagret», bokmerke i artikkelvisningen, «Lagre» ved
 * langt trykk på kortet, sveip for å fjerne, «Åpne original».
 */

internal data class Saved73(
    val id: String, val url: String, val title: String, val lead: String, val source: String, val status: String,
    val statusText: String, val savedAt: String?, val updatedAt: String, val words: Int, val images: Int,
) {
    val host: String get() = runCatching { java.net.URI(url).host.orEmpty().removePrefix("www.") }.getOrDefault("")
    val dot: Color get() = when (status) { "ok" -> Color(0xFF3D7A4F); "pending" -> Color(0xFF8F897C); else -> Color(0xFFA86A12) }
}

internal data class Block73(val t: String, val x: String, val src: String, val cap: String)
internal data class Doc73(val item: Saved73, val author: String, val published: String?, val image: String, val blocks: List<Block73>)

private fun JSONObject.s73(k: String): String = if (isNull(k)) "" else optString(k, "")
private fun saved73(o: JSONObject) = Saved73(
    o.s73("id"), o.s73("url"), o.s73("title"), o.s73("lead"), o.s73("source"), o.s73("status").ifBlank { "pending" },
    o.s73("statusText").ifBlank { "Laster ned…" }, o.s73("savedAt").ifBlank { null }, o.s73("updatedAt"), o.optInt("words", 0), o.optInt("images", 0),
)
private fun doc73(o: JSONObject): Doc73 {
    val arr = o.optJSONArray("blocks") ?: JSONArray()
    val blocks = (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let { b -> Block73(b.s73("t").ifBlank { "p" }, b.s73("x"), b.s73("src"), b.s73("cap")) } }
    return Doc73(saved73(o), o.s73("author"), o.s73("published").ifBlank { null }, o.s73("image"), blocks)
}
private fun list73(raw: String): List<Saved73> {
    val arr = runCatching { JSONObject(raw).optJSONArray("items") }.getOrNull() ?: return emptyList()
    return (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let(::saved73) }
}

/** data:image/…;base64,… → Bitmap (offline-kopien). */
internal fun bmp73(src: String): Bitmap? {
    if (!src.startsWith("data:image/")) return null
    val i = src.indexOf(',')
    if (i < 0) return null
    return runCatching { val b = Base64.decode(src.substring(i + 1), Base64.DEFAULT); BitmapFactory.decodeByteArray(b, 0, b.size) }.getOrNull()
}

private val MON73 = listOf("jan.", "feb.", "mars", "apr.", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des.")
private fun day73(iso: String?): String {
    val t = iso?.let { s -> runCatching { OffsetDateTime.parse(s).atZoneSameInstant(ZoneId.systemDefault()) }.getOrNull() } ?: return ""
    return "${t.dayOfMonth}. ${MON73[t.monthValue - 1]}"
}
private fun num73(n: Int): String = String.format(Locale("nb", "NO"), "%,d", n).replace(',', ' ').replace('.', ' ')

/** Tilstand for lagrede artikler (felles for leseren og artikkelvisningen). */
internal object News73 {
    var items by mutableStateOf<List<Saved73>>(emptyList())
    var showTab by mutableStateOf(false)
    var open by mutableStateOf<Saved73?>(null)
    var docs by mutableStateOf<Map<String, Doc73>>(emptyMap())
    var offline by mutableStateOf(false)
    var query by mutableStateOf("")
    private var loading = false
    private var started = false

    private fun dir(vm: AppViewModel): File = File(vm.getApplication<android.app.Application>().filesDir, "news73").apply { mkdirs() }
    private fun file(vm: AppViewModel, id: String) = File(dir(vm), id.filter { it.isLetterOrDigit() || it == '-' } + ".json")

    fun isSaved(url: String) = items.any { it.url == url }
    fun itemFor(url: String) = items.firstOrNull { it.url == url }

    /** Laster lista (lokal kopi først, så serveren) og henter offline-kopiene som mangler. Avbrudd kastes videre. */
    suspend fun load(vm: AppViewModel) {
        if (!started) {
            started = true
            runCatching { withContext(Dispatchers.IO) { File(dir(vm), "list.json").takeIf { it.exists() }?.readText() } }.getOrNull()?.let { items = list73(it) }
        }
        if (loading) return
        loading = true
        try {
            var rounds = 0
            while (true) {
                val raw = try { vm.api27b { hlGet("/news/saved", timeout = 20_000) } } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
                if (raw == null) { offline = true; break }
                offline = false
                items = list73(raw)
                withContext(Dispatchers.IO) { runCatching { File(dir(vm), "list.json").writeText(raw) } }
                syncDocs(vm)
                if (items.none { it.status == "pending" } || rounds++ > 30) break
                delay(2500)
            }
        } finally { loading = false }
    }

    private suspend fun syncDocs(vm: AppViewModel) {
        val ids = items.map { it.id }.toSet()
        withContext(Dispatchers.IO) {
            dir(vm).listFiles()?.forEach { f -> if (f.name != "list.json" && f.nameWithoutExtension !in ids) f.delete() }
        }
        for (it in items) {
            if (it.status == "pending") continue
            val local = docs[it.id] ?: readLocal(vm, it.id)
            if (local != null && local.item.updatedAt == it.updatedAt) { if (docs[it.id] == null) docs = docs + (it.id to local); continue }
            fetchDoc(vm, it.id)
        }
    }

    private suspend fun readLocal(vm: AppViewModel, id: String): Doc73? = withContext(Dispatchers.IO) {
        runCatching { file(vm, id).takeIf { it.exists() }?.readText()?.let { doc73(JSONObject(it)) } }.getOrNull()
    }

    private suspend fun fetchDoc(vm: AppViewModel, id: String) {
        val raw = try { vm.api27b { request("GET", "/news/saved/$id?offline=1", prefix = Api.HOMELAB, read = 60_000) } } catch (e: CancellationException) { throw e } catch (e: Exception) { null }
        if (raw != null) {
            withContext(Dispatchers.IO) { runCatching { file(vm, id).writeText(raw) } }
            runCatching { doc73(JSONObject(raw)) }.getOrNull()?.let { d -> docs = docs + (id to d) }
        } else readLocal(vm, id)?.let { d -> docs = docs + (id to d) }
    }

    suspend fun doc(vm: AppViewModel, id: String): Doc73? {
        docs[id]?.let { return it }
        readLocal(vm, id)?.let { d -> docs = docs + (id to d); return d }
        fetchDoc(vm, id)
        return docs[id]
    }

    fun save(vm: AppViewModel, x: NewsItem) {
        if (isSaved(x.url)) return
        val tmp = Saved73("tmp-" + System.currentTimeMillis(), x.url, x.title, x.excerpt.orEmpty(), x.feed, "pending", "Laster ned…", OffsetDateTime.now().toString(), "", 0, 0)
        items = listOf(tmp) + items
        vm.flash("Lagret · lastes ned for lesing uten nett")
        vm.launch27b {
            val body = JSONObject().put("url", x.url).put("title", x.title).put("lead", x.excerpt.orEmpty()).put("description", x.excerpt.orEmpty())
                .put("image", x.image.orEmpty()).put("source", x.feed).put("published", x.published.orEmpty())
            val ok = try { vm.api27b { hlPost("/news/saved", body) }; true } catch (e: CancellationException) { throw e } catch (e: Exception) { false }
            if (!ok) { items = items.filter { it.id != tmp.id }; vm.flash("Fikk ikke lagret artikkelen"); return@launch27b }
            load(vm)
        }
    }

    fun remove(vm: AppViewModel, id: String) {
        items = items.filter { it.id != id }
        docs = docs - id
        if (open?.id == id) open = null
        vm.flash("Fjernet fra Lagret")
        vm.launch27b {
            withContext(Dispatchers.IO) { runCatching { file(vm, id).delete() } }
            try { vm.api27b { hlDelete("/news/saved/$id") } } catch (e: CancellationException) { throw e } catch (e: Exception) { /* 404: allerede borte */ }
            load(vm)
        }
    }

    fun toggle(vm: AppViewModel, x: NewsItem) { itemFor(x.url)?.let { remove(vm, it.id) } ?: save(vm, x) }

    fun retry(vm: AppViewModel, id: String) {
        items = items.map { if (it.id == id) it.copy(status = "pending", statusText = "Laster ned…") else it }
        docs = docs - id
        vm.launch27b {
            try { vm.api27b { hlPost("/news/saved/$id/retry") } } catch (e: CancellationException) { throw e } catch (e: Exception) { vm.flash("Fikk ikke prøvd på nytt") }
            load(vm)
        }
    }
}

/* ---------------- Visninger ---------------- */

/** Bokmerket øverst i artikkelvisningen (1c): rund knapp, fylt når saken er lagret. */
@Composable
internal fun News73Bookmark(vm: AppViewModel, x: NewsItem, p: PaperPal) {
    val on = News73.isSaved(x.url)
    val label = if (on) "Fjern fra lagret" else "Lagre artikkel"
    Box(
        Modifier.size(44.dp).clip(CircleShape).background(if (on) p.ink else p.card).border(1.dp, if (on) p.ink else p.line, CircleShape)
            .clickable(onClickLabel = label) { News73.toggle(vm, x) }.semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { BookmarkGlyph73(if (on) p.bg else p.ink, on) }
}

/** Bokmerke-figuren (samme form som i designet: M6 3h12v18l-6-4.5L6 21z). */
@Composable
internal fun BookmarkGlyph73(color: Color, filled: Boolean, size: Int = 18) {
    androidx.compose.foundation.Canvas(Modifier.size(size.dp)) {
        val s = this.size.width / 24f
        val path = androidx.compose.ui.graphics.Path().apply { moveTo(6 * s, 3 * s); lineTo(18 * s, 3 * s); lineTo(18 * s, 21 * s); lineTo(12 * s, 16.5f * s); lineTo(6 * s, 21 * s); close() }
        if (filled) drawPath(path, color) else drawPath(path, color, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2 * s, join = androidx.compose.ui.graphics.StrokeJoin.Round))
    }
}

/** «Lagret 28. okt.» / «Laster ned…» / «Kun sammendrag» med «Prøv å laste ned på nytt». */
@Composable
internal fun News73Banner(vm: AppViewModel, sv: Saved73, p: PaperPal, words: Int? = null) {
    val ok = sv.status == "ok"
    val pending = sv.status == "pending"
    val title = when { ok -> "Lagret ${day73(sv.savedAt)}"; pending -> "Laster ned…"; else -> sv.statusText }
    val img = if (sv.images > 0) ", ${sv.images} ${if (sv.images == 1) "bilde" else "bilder"}" else ""
    val sub = when {
        pending -> "Hele artikkelen hentes fra ${sv.host}"
        ok -> "Hele artikkelen (${num73(words ?: sv.words)} ord$img) er lastet ned fra ${sv.host} · kan leses uten nett"
        else -> "Fant ikke hele teksten hos ${sv.host}. Tittel, ingress og lenke er lagret."
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.card).border(1.dp, p.line, RoundedCornerShape(14.dp)).padding(14.dp, 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val markBg = when { pending -> p.line; ok -> p.ink; else -> Color(0xFFA86A12) }
        Box(Modifier.size(28.dp).clip(CircleShape).background(markBg), contentAlignment = Alignment.Center) {
            Text(if (ok) "✓" else if (pending) "…" else "!", color = if (pending) p.ink else p.bg, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = p.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold, lineHeight = 19.sp)
            Text(sub, color = p.mut, fontSize = 14.sp, lineHeight = 19.sp)
            if (!ok && !pending) {
                Box(Modifier.padding(top = 6.dp).height(32.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable { News73.retry(vm, sv.id) }.padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
                    Text("Prøv å laste ned på nytt", color = p.ink, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

/** Fanen «Lagret» i fanelinja (bokmerke + navn). */
@Composable
internal fun News73Tab(vm: AppViewModel, p: PaperPal) {
    val on = News73.showTab
    Column(Modifier.clickable(onClickLabel = "Lagret") { News73.showTab = true; vm.launch27b { News73.load(vm) } }.padding(top = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            BookmarkGlyph73(if (on) p.ink else p.mut, true, 13)
            Text("Lagret", color = if (on) p.ink else p.mut, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(10.dp))
        Box(Modifier.width(62.dp).height(2.dp).background(if (on) p.ink else Color.Transparent))
    }
}

/** Fanen «Lagret» (1d): søk, kilde, tittel, status med prikk og bilde 84 × 84. Sveip for å fjerne. */
@Composable
internal fun News73List(vm: AppViewModel, p: PaperPal, modifier: Modifier) {
    LaunchedEffect(Unit) { News73.load(vm) }
    val q = News73.query.trim().lowercase()
    val list = News73.items.filter { q.isEmpty() || "${it.title} ${it.source} ${it.lead}".lowercase().contains(q) }
    LazyColumn(modifier, contentPadding = PaddingValues(22.dp, 12.dp, 22.dp, 40.dp)) {
        item(key = "q73") {
            Row(Modifier.fillMaxWidth().height(44.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("⌕", color = p.mut, fontSize = 17.sp)
                Box(Modifier.weight(1f)) {
                    if (News73.query.isEmpty()) Text("Søk i lagrede artikler", color = p.mut, fontSize = 15.sp, maxLines = 1)
                    BasicTextField(News73.query, { News73.query = it }, singleLine = true, cursorBrush = SolidColor(p.ink),
                        textStyle = TextStyle(color = p.ink, fontSize = 15.sp), modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Søk i lagrede artikler" })
                }
            }
            if (News73.offline) Text("Uten nett · viser kopiene på telefonen", color = p.mut, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        }
        if (News73.items.isEmpty()) item(key = "empty73") {
            Column(Modifier.fillMaxWidth().padding(vertical = 40.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                PSerif("Ingen lagrede artikler ennå", 22.sp, p.ink)
                Text("Trykk på bokmerket i en sak, eller hold inne og velg «Lagre». Hele artikkelen lastes ned og kan leses uten nett.", color = p.mut, fontSize = 14.sp, lineHeight = 20.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        }
        items(list, key = { x -> x.id }) { x -> SavedRow73(vm, x, p) }
    }
}

@Composable
private fun SavedRow73(vm: AppViewModel, sv: Saved73, p: PaperPal) {
    val state = rememberSwipeToDismissBoxState(confirmValueChange = { v ->
        if (v == SwipeToDismissBoxValue.EndToStart) { News73.remove(vm, sv.id); true } else false
    })
    SwipeToDismissBox(
        state = state,
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            Box(Modifier.fillMaxSize().background(Color(0xFFB23A2A)).padding(end = 20.dp), contentAlignment = Alignment.CenterEnd) {
                Text("Fjern fra lagret", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        },
    ) {
        Column(Modifier.background(p.bg)) {
            Row(Modifier.fillMaxWidth().clickable(onClickLabel = "Les den lagrede kopien") { News73.open = sv }.padding(vertical = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    PLabel(sv.source.ifBlank { sv.host }, p.mut)
                    PSerif(sv.title, 19.sp, p.ink, maxLines = 4)
                    Row(Modifier.padding(top = 3.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(7.dp).clip(CircleShape).background(sv.dot))
                        Text(sv.statusText, color = sv.dot, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Thumb73(sv, p)
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        }
    }
}

@Composable
private fun Thumb73(sv: Saved73, p: PaperPal) {
    val src = News73.docs[sv.id]?.image.orEmpty()
    val bmp = remember(src) { bmp73(src) }
    Box(Modifier.size(84.dp).clip(RoundedCornerShape(12.dp)).background(newsColor27(sv.source)), contentAlignment = Alignment.Center) {
        if (bmp != null) Image(bmp.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        else Text(newsInitials27(sv.source.ifBlank { sv.host }), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, maxLines = 1)
    }
}

/** Leservisningen for en lagret artikkel (samme typografi som Nyhetsleser). Leser alltid den lokale kopien. */
@Composable
internal fun News73Reader(vm: AppViewModel, p: PaperPal) {
    val start = News73.open ?: return
    val cur = News73.items.firstOrNull { it.id == start.id } ?: start
    val ctx = LocalContext.current
    var doc by remember(start.id) { mutableStateOf(News73.docs[start.id]) }
    var busy by remember(start.id) { mutableStateOf(doc == null) }
    LaunchedEffect(start.id, cur.updatedAt) { doc = News73.doc(vm, start.id); busy = false }
    BackHandler { Haptics.back(); News73.open = null }
    val scroll = rememberScrollState()
    Box(Modifier.fillMaxSize().background(p.bg).clickable(remember { MutableInteractionSource() }, null) {}) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(22.dp, 14.dp, 22.dp, 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.height(44.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable(onClickLabel = "Tilbake") { Haptics.back(); News73.open = null }.padding(start = 12.dp, end = 16.dp),
                    contentAlignment = Alignment.Center) { Text("‹ Lagret", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
                Spacer(Modifier.weight(1f))
                Box(Modifier.size(44.dp).clip(CircleShape).background(p.card).border(1.dp, p.line, CircleShape).clickable(onClickLabel = "Del") {
                    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, cur.title).putExtra(Intent.EXTRA_TEXT, cur.title + "\n" + cur.url)
                    runCatching { ctx.startActivity(Intent.createChooser(send, "Del saken").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }, contentAlignment = Alignment.Center) { Text("↑", color = p.ink, fontSize = 17.sp, fontWeight = FontWeight.Bold) }
            }
            Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(scroll).padding(22.dp, 8.dp, 22.dp, 40.dp).widthIn(max = 720.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                val d = doc
                PLabel(listOf(cur.source, day73(d?.published)).filter { it.isNotBlank() }.joinToString(" · "), p.lab, 11.sp)
                PSerif(cur.title, 32.sp, p.ink)
                if (cur.lead.isNotBlank()) PSerif(cur.lead, 17.sp, p.mut, weight = FontWeight.Normal)
                if (!d?.author.isNullOrBlank()) Text(d?.author.orEmpty(), color = p.mut, fontSize = 13.sp)
                val hero = d?.image.orEmpty()
                if (hero.isNotEmpty() && d?.blocks?.none { it.src == hero } == true) Image73(hero, "", p)
                News73Banner(vm, cur, p, d?.item?.words)
                if (busy && d == null) Text("Åpner den lagrede kopien …", color = p.mut, fontSize = 15.sp)
                d?.blocks?.forEach { b -> Block73View(b, p) }
                Box(Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(25.dp)).background(p.ink).clickable { openLink(ctx, cur.url) }, contentAlignment = Alignment.Center) {
                    Text("Åpne original ↗", color = p.bg, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Box(Modifier.align(Alignment.CenterHorizontally).height(40.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable { News73.remove(vm, cur.id) }.padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center) { Text("Fjern fra lagret", color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp) }
            }
        }
    }
}

@Composable
private fun Block73View(b: Block73, p: PaperPal) {
    when (b.t) {
        "h" -> PSerif(b.x, 21.sp, p.ink, modifier = Modifier.padding(top = 6.dp))
        "quote" -> Row(Modifier.height(IntrinsicSize.Min)) {
            Box(Modifier.width(3.dp).fillMaxHeight().background(p.lab))
            Text(b.x, color = p.ink, fontFamily = PaperFonts.serif, fontStyle = FontStyle.Italic, fontSize = 18.sp, lineHeight = 27.sp, modifier = Modifier.padding(start = 14.dp))
        }
        "li" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("•", color = p.mut, fontFamily = PaperFonts.serif, fontSize = 18.sp, lineHeight = 27.sp)
            Text(b.x, color = p.ink, fontFamily = PaperFonts.serif, fontSize = 18.sp, lineHeight = 27.sp, modifier = Modifier.weight(1f))
        }
        "img" -> Image73(b.src, b.cap, p)
        "pre" -> Text(b.x, color = p.ink, fontFamily = PaperFonts.mono, fontSize = 13.sp, lineHeight = 19.sp,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(p.card).padding(12.dp))
        else -> Text(b.x, color = p.ink, fontFamily = PaperFonts.serif, fontSize = 18.sp, lineHeight = 28.sp)
    }
}

@Composable
private fun Image73(src: String, cap: String, p: PaperPal) {
    val bmp = remember(src) { bmp73(src) } ?: return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Image(bmp.asImageBitmap(), cap.ifBlank { null }, contentScale = ContentScale.FillWidth, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)))
        if (cap.isNotBlank()) Text(cap, color = p.mut, fontSize = 13.sp, lineHeight = 18.sp)
    }
}
