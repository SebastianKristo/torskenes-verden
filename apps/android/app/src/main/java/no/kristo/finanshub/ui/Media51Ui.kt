package no.kristo.finanshub.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import no.kristo.finanshub.*
import org.json.JSONObject

/*
 * Prompt 51 (ANDFEAT51): Media – MEDFAM51 /api/media51 ($S/SERVER51-API.md), fasit public/js/medfam51.js (#/mediakveld).
 *  - «Hva skal vi se i kveld?»: forslag fra eget bibliotek ut fra hvem som er hjemme, lengde, type og sjanger, med forklaring.
 *  - Fortsett: lydbøker og podkaster fra Audiobookshelf («fortsett der du slapp»).
 *  - Undertekster: filmer/episoder som mangler norsk, «Hent undertekster» (Bazarr).
 *  - Lagring (bare admin): diskbruk, «sett og stort»-forslag, slett med angre (24 t) og papirkurven.
 *  Åpnes fra raden under fanene i Media (MediaEntry51) og finanshub://kveld[/lyd|subs|lagring].
 */

private val MTABS51 = listOf("kveld" to "I kveld", "lyd" to "Fortsett", "subs" to "Undertekster", "lagring" to "Lagring")

/** Raden i Media (under fanene): snarveier til sidene her. Lagring bare for admin. */
@Composable
internal fun MediaEntry51(vm: AppViewModel) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        MTABS51.filter { it.first != "lagring" || vm.userIsAdmin }.forEach { (k, n) ->
            Box(Modifier.heightIn(min = 48.dp), contentAlignment = Alignment.Center) { PChip(if (k == "kveld") "✦ $n" else n, false) { vm.open51(k) } }
        }
    }
}

@Composable
private fun MediaTabs51(vm: AppViewModel, cur: String) {
    Tabs51(MTABS51.filter { it.first != "lagring" || vm.userIsAdmin }, cur) { k -> if (k != cur) { close51(); vm.open51(k) } }
}

/* ======================= I kveld ======================= */

@Composable
internal fun Tonight51Page(vm: AppViewModel) {
    val p = PaperPal.current
    Page51("Hva skal vi se i kveld?", "Media", onRefresh = { vm.load51("tonight", force = true) }) {
        MediaTabs51(vm, "kveld")
        Choice51(listOf("60" to "Under 1 t", "90" to "Under 1,5 t", "120" to "Under 2 t", "600" to "Uansett lengde"), F51.opt("kv.min", "120")) { F51.ui["kv.min"] = it; vm.load51("tonight", force = true) }
        Choice51(listOf("any" to "Film og serie", "movie" to "Film", "series" to "Serie"), F51.opt("kv.kind", "any")) { F51.ui["kv.kind"] = it; vm.load51("tonight", force = true) }
        Keyed51(vm, "tonight") { d ->
            val genres = d.arr51("genres")
            if (genres.isNotEmpty()) Choice51(listOf("" to "Alle sjangre") + genres.map { it.str51("id") to it.str51("label", it.str51("id")) }, F51.opt("kv.genre", "")) {
                F51.ui["kv.genre"] = it; vm.load51("tonight", force = true)
            }
            Who51(vm, d.obj51("who"))
            val items = d.arr51("items")
            when {
                d.has("configured") && !d.optBoolean("configured", true) -> Empty51("Media er ikke satt opp", "Legg inn Sonarr og Radarr under Integrasjoner, så foreslår Homelab noe fra ditt eget bibliotek.")
                items.isEmpty() -> Empty51("Ingen forslag", d.s43("empty") ?: "Prøv en annen lengde, type eller sjanger.")
                else -> TonightGrid51(vm, items)
            }
            d.optJSONArray("errors").strs51().forEach { Text(it, color = p.lab, fontSize = 12.5.sp) }
            if (d.optBoolean("phrased")) Text("Teksten er formulert av en lokal modell" + (d.s43("model")?.let { " ($it)" } ?: "") + ". Fakta og rekkefølge er de samme.", color = p.mut, fontSize = 12.sp)
        }
    }
}

@Composable
private fun Who51(vm: AppViewModel, who: JSONObject?) {
    val p = PaperPal.current
    who ?: return
    val people = who.arr51("people")
    val sel = F51.ui["kv.who"]?.split(',')?.filter { it.isNotBlank() }?.toSet()
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(who.s43("note") ?: "Hvem ser på?", color = p.mut, fontSize = 12.5.sp)
        if (people.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            people.forEach { pe ->
                val id = pe.str51("userId")
                val on = sel?.contains(id) ?: true
                Box(Modifier.heightIn(min = 48.dp), contentAlignment = Alignment.Center) {
                    PChip(if (pe.optBoolean("self")) "${pe.str51("name")} (deg)" else pe.str51("name"), on) {
                        val cur = sel ?: people.map { it.str51("userId") }.toSet()
                        val next = if (on) cur - id else cur + id
                        F51.ui["kv.who"] = next.joinToString(",")
                        vm.load51("tonight", force = true)
                    }
                }
            }
        }
    }
}

@Composable
private fun TonightGrid51(vm: AppViewModel, items: List<JSONObject>) {
    val wide = LocalWide45.current
    val rows = items.chunked(if (wide) 2 else 1)
    rows.forEach { r ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            r.forEach { it -> Box(Modifier.weight(1f)) { Suggestion51(vm, it) } }
            if (r.size == 1 && wide) Spacer(Modifier.weight(1f))
        }
    }
}

@Composable
private fun Suggestion51(vm: AppViewModel, s: JSONObject) {
    val p = PaperPal.current
    val title = s.str51("title")
    Card51(onClick = { openInMedia51(vm, s) }) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            NetImg51(vm, s.s43("poster"), null, Modifier.size(64.dp, 96.dp).clip(RoundedCornerShape(10.dp))) {
                Box(Modifier.fillMaxSize().background(p.surf2), contentAlignment = Alignment.Center) { Text(title.take(1), color = p.mut, fontWeight = FontWeight.Bold, fontSize = 22.sp) }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                PSerif(title, 18.sp, maxLines = 2)
                val meta = listOfNotNull(s.i43("year")?.toString(), s.s43("runtimeText"), s.optJSONArray("genres").strs51().take(2).joinToString(", ").ifBlank { null },
                    if (s.str51("kind") == "series") "Serie" else "Film").joinToString(" · ")
                Text(meta, color = p.mut, fontSize = 12.5.sp, maxLines = 2)
                s.obj51("next")?.s43("code")?.let { Text("Neste: $it", color = p.ink, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold) }
                Text(s.s43("text") ?: s.str51("reason"), color = p.ink, fontSize = 13.sp, maxLines = 4, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** Åpner forslaget i Media (detaljsiden henter resten). */
private fun openInMedia51(vm: AppViewModel, s: JSONObject) {
    val id = s.i43("id") ?: return
    val kind = if (s.str51("kind") == "series") "tv" else "film"
    F51.pages.clear()
    vm.p43.tab = if (kind == "tv") "sonarr" else "radarr"
    vm.openMedia43()
    vm.openItem43(parseItem43(JSONObject().put("id", id).put("title", s.str51("title")).put("year", s.opt("year")).put("poster", s.opt("poster")), kind))
}

/* ======================= Fortsett (lydbøker og podkaster) ======================= */

@Composable
internal fun Audio51Page(vm: AppViewModel) {
    val p = PaperPal.current
    val ctx = LocalContext.current
    Page51("Fortsett der du slapp", "Lydbøker og podkaster", onRefresh = { vm.load51("audio", force = true) }) {
        MediaTabs51(vm, "lyd")
        Keyed51(vm, "audio") { d ->
            val items = d.arr51("items")
            when {
                !d.optBoolean("configured", true) -> Empty51("Audiobookshelf er ikke satt opp", d.s43("text") ?: "Admin kan legge inn Audiobookshelf i compose-profilen «audiobookshelf» og ABS_URL/ABS_TOKEN i .env.")
                d.s43("absUser") == null && items.isEmpty() -> AbsUser51(vm, d.s43("text"))
                items.isEmpty() -> Empty51("Ingenting å fortsette", d.s43("text") ?: "Start en lydbok eller podkast i Audiobookshelf, så dukker den opp her.")
                else -> items.forEach { a ->
                    key(a.str51("id") + a.str51("episodeId")) {
                        Card51(onClick = a.s43("openUrl")?.let { u -> { openLink(ctx, if (u.startsWith("/")) vm.base.trimEnd('/') + u else u) } }) {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                NetImg51(vm, a.s43("coverUrl"), null, Modifier.size(64.dp).clip(RoundedCornerShape(10.dp))) { Box(Modifier.fillMaxSize().background(p.surf2)) }
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                    PSerif(a.str51("title"), 17.sp, maxLines = 2)
                                    Text(listOfNotNull(a.s43("episodeTitle"), a.s43("author"), if (a.str51("kind") == "podcast") "Podkast" else "Lydbok").joinToString(" · "), color = p.mut, fontSize = 12.5.sp, maxLines = 2)
                                    val prog = a.num51("progress").let { if (it <= 1.0) it * 100 else it }
                                    Bar51(prog, p.ink, "${num51(prog)} prosent hørt")
                                    Text(listOfNotNull(a.s43("progressText"), a.s43("remainingText")).joinToString(" · "), color = p.ink, fontSize = 12.5.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AbsUser51(vm: AppViewModel, text: String?) {
    var u by remember { mutableStateOf("") }
    Card51 {
        PSerif("Koble til Audiobookshelf", 20.sp)
        Text(text ?: "Skriv brukernavnet ditt i Audiobookshelf, så vises lydbøkene og podkastene dine her.", color = PaperPal.current.mut, fontSize = 13.sp)
        PField("Brukernavn i Audiobookshelf", u, { u = it.take(80) })
        Btn51("Lagre", "ink", busy = F51.acting == "absuser") {
            if (u.isBlank()) return@Btn51
            vm.act51("absuser", "PUT", Api.HOMELAB, "/media51/audio/me", JSONObject().put("absUser", u.trim()), ok = "Lagret", reload = listOf("audio"))
        }
    }
}

/* ======================= Undertekster ======================= */

@Composable
internal fun Subs51Page(vm: AppViewModel) {
    val p = PaperPal.current
    Page51("Norske undertekster", "Media · Bazarr", onRefresh = { vm.load51("subsStatus", true); vm.load51("subsWanted", true) }) {
        MediaTabs51(vm, "subs")
        Keyed51(vm, "subsStatus") { st ->
            Card51 {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Tag51(if (st.optBoolean("reachable")) "Tilkoblet" else if (st.optBoolean("configured")) "Svarer ikke" else "Ikke satt opp", if (st.optBoolean("reachable")) "ok" else "warn")
                    st.s43("version")?.let { Text("Bazarr $it", color = p.mut, fontSize = 12.5.sp) }
                }
                Text(st.str51("text"), color = p.ink, fontSize = 13.5.sp)
                st.obj51("whisper")?.s43("text")?.let { Text(it, color = p.mut, fontSize = 12.5.sp) }
            }
            if (st.optBoolean("configured")) Keyed51(vm, "subsWanted") { w ->
                val items = w.arr51("items")
                if (items.isEmpty()) Empty51("Alt har norsk tekst", "Ingen filmer eller episoder mangler norske undertekster.")
                else Card51 {
                    PSerif("Mangler norsk (${w.i43("total") ?: items.size})", 20.sp)
                    items.forEachIndexed { i, it ->
                        key(it.str51("kind") + it.str51("id")) {
                            val kind = it.str51("kind", "movie")
                            val id = it.str51("id")
                            Column {
                                Line51(it.str51("title"), it.str51("statusText"), null, top = i > 0)
                                Btn51("Hent undertekster", busy = F51.acting == "subs$kind$id") {
                                    vm.act51("subs$kind$id", "POST", Api.HOMELAB, "/media51/subs/$kind/$id/search") { r -> F51.toast = r.s43("message") ?: "Søker etter undertekster" }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/* ======================= Lagring (admin) ======================= */

@Composable
internal fun Storage51(vm: AppViewModel, d: JSONObject) {
    val p = PaperPal.current
    var del by remember { mutableStateOf<JSONObject?>(null) }
    var empty by remember { mutableStateOf(false) }
    Cols51(
        left = {
            Card51 {
                PSerif("Forslag til sletting", 20.sp)
                Text(d.str51("recommendText"), color = p.mut, fontSize = 13.sp)
                val recs = d.arr51("recommendations")
                if (recs.isEmpty()) Text("Ingen store, sette titler å foreslå.", color = p.mut, fontSize = 13.sp)
                recs.forEachIndexed { i, r ->
                    key(r.str51("kind") + r.str51("id")) {
                        Column {
                            Line51(r.str51("title") + (r.i43("year")?.let { " ($it)" } ?: ""), listOfNotNull(r.s43("reason"), r.s43("watchedBy")?.let { "sett av $it" }).joinToString(" · "),
                                r.str51("sizeText"), top = i > 0)
                            Btn51("Slett …") { del = r }
                        }
                    }
                }
            }
            val pend = d.arr51("deletions").filter { it.optBoolean("canUndo") || it.str51("status") == "pending" }
            if (pend.isNotEmpty()) Card51 {
                PSerif("Slettet nylig", 20.sp)
                pend.forEachIndexed { i, x ->
                    Column {
                        Line51(x.str51("title"), x.str51("statusText") + (x.s43("undoUntil")?.let { " · angre til ${time51(it)}" } ?: ""), x.str51("sizeText"), top = i > 0)
                        if (x.optBoolean("canUndo")) Btn51("Angre", "ink", busy = F51.acting == "undo${x.str51("id")}") {
                            vm.act51("undo${x.str51("id")}", "POST", Api.HOMELAB, "/media51/storage/deletions/${x.str51("id")}/undo", reload = listOf("storage")) { r ->
                                F51.toast = r.s43("warning") ?: r.s43("message") ?: "Angret"
                            }
                        }
                    }
                }
            }
        },
        right = {
            Card51 {
                PSerif("Disker", 20.sp)
                d.arr51("disks").forEachIndexed { i, k ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
                    Text(k.s43("label") ?: k.str51("path"), color = p.ink, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    Bar51(k.num51("usedPct"), if (k.optBoolean("warn")) p.lab else p.ink, "${num51(k.num51("usedPct"))} prosent brukt")
                    Text("${k.str51("freeText")} ledig av ${k.str51("totalText")}", color = if (k.optBoolean("warn")) p.lab else p.mut, fontSize = 12.5.sp)
                }
                d.obj51("services")?.let { sv ->
                    listOf("sonarr" to "Serier", "radarr" to "Filmer", "qbit" to "qBittorrent").forEach { (k, n) ->
                        sv.obj51(k)?.let { s -> Line51(n, "${s.i43("count") ?: 0} stk" + (s.i43("seeding")?.let { " · $it deler" } ?: ""), s.str51("sizeText")) }
                    }
                }
            }
            d.obj51("trash")?.let { t ->
                Card51 {
                    PSerif("Papirkurven", 20.sp)
                    Text(t.str51("text"), color = p.mut, fontSize = 13.sp)
                    if (t.optBoolean("configured")) Btn51("Tøm (eldre enn 24 t) …") { empty = true }
                }
            }
            d.optJSONArray("errors").strs51().forEach { Text(it, color = p.lab, fontSize = 12.5.sp) }
        },
    )
    del?.let { r ->
        Confirm51("Slette «${r.str51("title")}»?", "${r.str51("sizeText")} frigjøres. Du kan angre i 24 timer (Lagring → Slettet nylig).", "Slett", { del = null }) {
            vm.act51("sdel", "POST", Api.HOMELAB, "/media51/storage/delete", JSONObject().put("kind", r.str51("kind")).put("id", id51(r.str51("id"))).put("confirm", true),
                reload = listOf("storage")) { res -> F51.toast = res.s43("message") ?: "Lagt i kø for sletting" }
        }
    }
    if (empty) Confirm51("Tømme papirkurven?", "Filer som har ligget i papirkurven i mer enn 24 timer slettes for godt. Dette kan ikke angres.", "Tøm", { empty = false }) {
        vm.act51("trash", "POST", Api.HOMELAB, "/media51/storage/trash/empty", JSONObject().put("confirm", "SLETT"), reload = listOf("storage")) { r ->
            F51.toast = "${r.i43("removed") ?: 0} fjernet"
        }
    }
}

@Composable
internal fun Storage51Page(vm: AppViewModel) {
    Page51("Lagring", "Media · bare admin", onRefresh = { vm.load51("storage", force = true) }) {
        MediaTabs51(vm, "lagring")
        if (!vm.userIsAdmin) Empty51("Bare for admin", "Lagring og sletting i mediebiblioteket kan bare gjøres av admin.")
        else Keyed51(vm, "storage") { Storage51(vm, it) }
    }
}
