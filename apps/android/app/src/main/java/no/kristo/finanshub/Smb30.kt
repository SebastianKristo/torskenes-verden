package no.kristo.finanshub

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject

/*
 * Prompt 30 (ANDROID30): SMB-veiviseren «Sett opp nettverksdisk» (bare admin), samme flyt som web/PWA/iOS:
 * Finn server → Logg inn → Velg delt mappe → Velg mappe → Test og lagre. Grensesnittet ligger i ui/Smb30Ui.kt.
 * API (server/smb-browse.js, app-token med finance:write fra admin):
 *   POST /api/smb/discover → [{host, ip, name?}]          POST /api/smb/probe {host} → {ok, host, ip?, message?}
 *   POST /api/smb/shares {host, user, password, domain} → {shares:[{name, comment}], protocol}
 *   POST /api/smb/browse {…, share, path, protocol} → [{name, type}]   POST /api/smb/mkdir {…, name}
 *   POST /api/smb/test → {ok, writable, message}   POST /api/smb/save {…, use:[finans|system]} → {label}
 * Passordet ligger bare i minnet mens arket er åpent og nullstilles når det lukkes.
 */

val SMB30_STEPS = listOf("Finn server", "Logg inn", "Velg delt mappe", "Velg mappe", "Test og lagre")

data class Smb30Server(val host: String, val ip: String, val name: String) {
    val title: String get() = name.ifBlank { host }
    val sub: String get() = listOf(if (name.isNotBlank() && name != host) host else "", if (ip.isNotBlank() && ip != host) ip else "").filter { it.isNotBlank() }.joinToString(" · ")
}

data class Smb30Share(val name: String, val comment: String)

data class Smb30Err(val message: String, val kind: String) {
    val hints: List<String> get() = smbHints30(kind)
}

data class Smb30Test(val ok: Boolean, val writable: Boolean, val message: String)

class Smb30State {
    var open by mutableStateOf(false)
    var step by mutableStateOf(0)
    var servers by mutableStateOf<List<Smb30Server>>(emptyList())
    var scanning by mutableStateOf(false)
    var manual by mutableStateOf("")
    var probeFail by mutableStateOf("")
    var server by mutableStateOf(Smb30Server("", "", ""))
    var user by mutableStateOf("")
    var password by mutableStateOf("")
    var domain by mutableStateOf("")
    var guest by mutableStateOf(false)
    var shares by mutableStateOf<List<Smb30Share>>(emptyList())
    var proto by mutableStateOf("SMB3")
    var share by mutableStateOf("")
    var path by mutableStateOf<List<String>>(emptyList())
    var dirs by mutableStateOf<List<String>?>(null)
    /** Prompt 36 (POST /api/smb/list): mapper med 🔒 (navn → årsak), hint fra serveren, Vis skjulte og Skriv sti manuelt. */
    var locked by mutableStateOf<Map<String, String>>(emptyMap())
    var listHint by mutableStateOf("")
    var showHidden by mutableStateOf(false)
    var manualPath by mutableStateOf("")
    var showManual by mutableStateOf(false)
    var newDir by mutableStateOf("")
    var showNewDir by mutableStateOf(false)
    var test by mutableStateOf<Smb30Test?>(null)
    var testing by mutableStateOf(false)
    var useFinans by mutableStateOf(false)
    var useSystem by mutableStateOf(true)
    var encrypted by mutableStateOf(true)
    var busy by mutableStateOf(false)
    var error by mutableStateOf<Smb30Err?>(null)
    var doneLabel by mutableStateOf("")

    val label: String get() = "//${server.host}/$share" + if (path.isEmpty()) "" else "/" + path.joinToString("/")
    /** Prompt 36: «smb://truenas.local/backup/homelab/2026». */
    val url36: String get() = "smb://${server.host}/$share" + if (path.isEmpty()) "" else "/" + path.joinToString("/")

    fun reset() {
        step = 0; servers = emptyList(); scanning = false; manual = ""; probeFail = ""; server = Smb30Server("", "", "")
        user = ""; password = ""; domain = ""; guest = false; shares = emptyList(); proto = "SMB3"; share = ""; path = emptyList(); dirs = null
        locked = emptyMap(); listHint = ""; showHidden = false; manualPath = ""; showManual = false
        newDir = ""; showNewDir = false; test = null; testing = false; busy = false; error = null; doneLabel = ""
    }
}

/** Samme regel som serveren (SMB_SEG): bokstaver, tall, mellomrom og . _ - ( ) + , = @ # ~ ! */
fun smbValidName30(n: String): Boolean {
    if (n.isEmpty() || n.length > 120 || n.startsWith(" ") || n.endsWith(" ") || n.all { it == '.' }) return false
    val extra = " ._-()+,=@#~!"
    return n.all { it.isLetterOrDigit() || it in extra }
}

fun smbKind30(msg: String): String {
    val m = msg.lowercase()
    return when {
        "brukernavn eller passord" in m || "kontoen er låst" in m -> "auth"
        "smb-versjon" in m -> "proto"
        "ingen tilgang" in m || "skrivetilgang" in m -> "access"
        "fant ikke serveren" in m || "fant ikke smb" in m -> "host"
        "fant ikke den delte" in m -> "share"
        "fant ikke mappen" in m -> "notfound"
        "smbclient" in m -> "missing"
        else -> ""
    }
}

fun smbHints30(kind: String): List<String> = when (kind) {
    "host" -> listOf("Sjekk at IP-adressen eller navnet er riktig, og at NAS-en er på.",
        "Slå på SMB på NAS-en – Synology: Kontrollpanel → Filtjenester → SMB. QNAP: Nettverks- og filtjenester → Win/Mac/NFS.",
        "NAS-en og Homelab-serveren må være på samme hjemmenett.")
    "auth" -> listOf("Bruk en bruker som finnes på NAS-en.", "Prøv «Gjest» hvis den delte mappen er åpen for alle.")
    "access" -> listOf("Gi brukeren lese- og skrivetilgang til den delte mappen på NAS-en.", "Eller logg inn med en annen bruker.")
    "proto" -> listOf("Slå på SMB3 (eller minst SMB2) på NAS-en. SMB1 støttes ikke.")
    "share", "notfound" -> listOf("Gå tilbake og velg en annen mappe.")
    "missing" -> listOf("Installer smbclient på serveren: apt install smbclient.")
    else -> emptyList()
}

private fun smbErr30(e: Exception): Smb30Err = when {
    e is ApiException && e.status == 404 -> Smb30Err("Serveren har ikke veiviseren ennå. Oppdater Homelab.", "")
    e is ApiException && e.status == 403 -> Smb30Err("Bare administrator kan sette opp nettverksdisk.", "")
    else -> (e.message ?: "Noe gikk galt").let { Smb30Err(it, smbKind30(it)) }
}

private fun AppViewModel.smbCred30(): JSONObject {
    val s = smb30
    return JSONObject().put("host", s.server.host).put("user", if (s.guest) "" else s.user).put("password", if (s.guest) "" else s.password).put("domain", if (s.guest) "" else s.domain)
}

private fun AppViewModel.smbTarget30(path: List<String>): JSONObject =
    smbCred30().put("share", smb30.share).put("path", path.joinToString("/")).put("protocol", smb30.proto)

private suspend fun AppViewModel.smbPost30(path: String, body: JSONObject): String = api29 { hlPost("/smb$path", body) }

private fun arr30(raw: String): JSONArray = raw.trim().let { if (it.startsWith("[")) JSONArray(it) else JSONArray() }

/** Åpner veiviseren. finans/system: forhåndsvalgt bruk. */
fun AppViewModel.openSmb30(finans: Boolean, system: Boolean) {
    val s = smb30
    s.reset()
    s.useFinans = finans
    s.useSystem = system
    s.encrypted = bk29.settings.encrypt
    s.open = true
    smbScan30()
}

fun AppViewModel.closeSmb30() {
    smb30.password = ""
    smb30.open = false
}

fun AppViewModel.smbScan30() {
    val s = smb30
    s.scanning = true
    s.error = null
    launch29 {
        try {
            val a = arr30(smbPost30("/discover", JSONObject()))
            s.servers = (0 until a.length()).mapNotNull { a.optJSONObject(it) }.mapNotNull { o ->
                val h = o.optString("host").takeIf { it.isNotBlank() } ?: return@mapNotNull null
                Smb30Server(h, o.optString("ip"), o.optString("name").takeIf { it != "null" } ?: "")
            }
        } catch (e: Exception) { s.error = smbErr30(e) } finally { s.scanning = false }
    }
}

fun AppViewModel.smbPick30(srv: Smb30Server) {
    val s = smb30
    s.server = srv
    s.error = null
    s.probeFail = ""
    s.shares = emptyList()
    s.step = 1
}

fun AppViewModel.smbManual30(force: Boolean) {
    val s = smb30
    val host = s.manual.trim().removePrefix("smb://").trimStart('\\', '/').split('/', '\\').firstOrNull().orEmpty()
    if (host.isBlank()) { s.error = Smb30Err("Skriv IP-adressen (for eksempel 192.168.1.20) eller navnet på serveren.", ""); return }
    if (force) { smbPick30(Smb30Server(host.lowercase(), "", "")); return }
    s.busy = true
    s.error = null
    s.probeFail = ""
    launch29 {
        try {
            val o = JSONObject(smbPost30("/probe", JSONObject().put("host", host)))
            if (o.optBoolean("ok")) smbPick30(Smb30Server(o.optString("host", host), o.optString("ip").takeIf { it != "null" } ?: "", ""))
            else { s.probeFail = o.optString("host", host); s.error = Smb30Err(o.optString("message", "Fant ikke serveren."), "host") }
        } catch (e: Exception) { s.error = smbErr30(e) } finally { s.busy = false }
    }
}

fun AppViewModel.smbLogin30(guest: Boolean) {
    val s = smb30
    s.guest = guest
    if (!guest && s.user.isBlank()) { s.error = Smb30Err("Skriv brukernavnet, eller trykk «Gjest».", ""); return }
    s.busy = true
    s.error = null
    launch29 {
        try {
            val o = JSONObject(smbPost30("/shares", smbCred30()))
            val a = o.optJSONArray("shares") ?: JSONArray()
            s.shares = (0 until a.length()).mapNotNull { a.optJSONObject(it) }.map { Smb30Share(it.optString("name"), it.optString("comment")) }.filter { it.name.isNotBlank() }
            s.proto = if (o.optString("protocol") == "SMB2") "SMB2" else "SMB3"
            Haptics.select()
            s.step = 2
        } catch (e: Exception) { s.error = smbErr30(e) } finally { s.busy = false }
    }
}

fun AppViewModel.smbChoose30(sh: Smb30Share) {
    val s = smb30
    s.share = sh.name
    s.path = emptyList()
    s.dirs = null
    s.step = 3
    smbOpenDir30(emptyList())
}

fun AppViewModel.smbOpenDir30(path: List<String>) {
    val s = smb30
    s.busy = true
    s.error = null
    s.showNewDir = false
    launch29 {
        try {
            // Prompt 36: POST /list (undermapper, 🔒 uten tilgang, skjulte, hint); eldre server: /browse.
            val body = smbTarget30(path).put("showHidden", s.showHidden)
            val raw = try { smbPost30("/list", body) } catch (e: ApiException) { if (e.status == 404 || e.status == 405) null else throw e }
            if (raw != null && raw.trim().startsWith("{")) {
                val o = JSONObject(raw)
                val f = o.optJSONArray("folders") ?: JSONArray()
                val all = (0 until f.length()).mapNotNull { f.optJSONObject(it) }.filter { it.optString("name").isNotBlank() }
                s.dirs = all.map { it.optString("name") }
                s.locked = all.filter { it.optBoolean("locked") }.associate { it.optString("name") to (it.optString("reason").takeIf { r -> r.isNotBlank() && r != "null" } ?: "Ingen tilgang for ${if (s.guest) "gjest" else s.user}") }
                s.listHint = o.optString("hint").takeIf { it != "null" } ?: ""
            } else {
                val a = arr30(raw ?: smbPost30("/browse", body))
                s.dirs = (0 until a.length()).mapNotNull { a.optJSONObject(it)?.optString("name")?.takeIf { n -> n.isNotBlank() } }
                s.locked = emptyMap(); s.listHint = ""
            }
            s.path = path
        } catch (e: Exception) { s.error = smbErr30(e) } finally { s.busy = false }
    }
}

fun AppViewModel.smbMkdir30() {
    val s = smb30
    val n = s.newDir.trim()
    if (!smbValidName30(n)) { s.error = Smb30Err("Ugyldig mappenavn. Bruk bokstaver, tall, mellomrom og . _ - ( ) (ikke / \\ \" ' ; eller ..).", ""); return }
    s.busy = true
    s.error = null
    launch29 {
        try {
            smbPost30("/mkdir", smbTarget30(s.path).put("name", n))
            s.newDir = ""
            s.busy = false
            smbOpenDir30(s.path + n)
        } catch (e: Exception) { s.error = smbErr30(e); s.busy = false }
    }
}

fun AppViewModel.smbTest30() {
    val s = smb30
    s.testing = true
    s.test = null
    s.error = null
    launch29 {
        try {
            val o = JSONObject(smbPost30("/test", smbTarget30(s.path)))
            s.test = Smb30Test(o.optBoolean("ok"), o.optBoolean("writable"), o.optString("message"))
        } catch (e: Exception) { s.test = Smb30Test(false, false, smbErr30(e).message) } finally { s.testing = false }
    }
}

/** Prompt 36: «Skriv sti manuelt» (/backup/homelab): åpner stien (også mapper skjult med Access-Based Enumeration). */
fun AppViewModel.smbManualPath36() {
    val s = smb30
    val parts = s.manualPath.trim().replace('\\', '/').split('/').map { it.trim() }.filter { it.isNotEmpty() }
    if (parts.any { !smbValidName30(it) || it == ".." }) { s.error = Smb30Err("Ugyldig sti. Skriv for eksempel /backup/homelab.", ""); return }
    s.showManual = false
    smbOpenDir30(parts)
}

/** Prompt 36: «Velg» på en rad: bruker undermappen direkte. */
fun AppViewModel.smbPickDir36(name: String) {
    val s = smb30
    s.path = s.path + name
    smbGo30(4)
}

fun AppViewModel.smbGo30(step: Int) {
    val s = smb30
    s.error = null
    s.step = step
    if (step == 4) smbTest30()
}

fun AppViewModel.smbBack30() {
    val s = smb30
    when {
        s.doneLabel.isNotBlank() || s.step == 0 -> closeSmb30()
        s.step == 3 && s.path.isNotEmpty() -> smbOpenDir30(s.path.dropLast(1))
        else -> { if (s.step == 3) s.dirs = null; s.error = null; s.step -= 1 }
    }
}

fun AppViewModel.smbSave30() {
    val s = smb30
    val use = listOfNotNull(if (s.useFinans) "finans" else null, if (s.useSystem) "system" else null)
    if (use.isEmpty()) { s.error = Smb30Err("Velg hva nettverksdisken skal brukes til.", ""); return }
    s.busy = true
    s.error = null
    launch29 {
        try {
            val o = JSONObject(smbPost30("/save", smbTarget30(s.path).put("use", JSONArray(use))))
            s.doneLabel = o.optString("label").ifBlank { s.label }
            s.password = ""
            Haptics.success()
            loadBk29()
        } catch (e: Exception) { s.error = smbErr30(e) } finally { s.busy = false }
    }
}

/** Innstillinger → Backup → Hvor: slå kopien til nettverksdisken av/på. */
fun AppViewModel.setBkSmb30(on: Boolean) {
    val b = bk29
    val old = b.settings
    b.settings = old.copy(smbOn = on)
    Haptics.select()
    launch29 {
        try {
            hlPutSmb30(JSONObject().put("target", JSONObject().put("smb", JSONObject().put("enabled", on))))
            loadBk29()
        } catch (e: Exception) { b.settings = old; flash("Fikk ikke lagret: " + (e.message ?: "feil")) }
    }
}

private suspend fun AppViewModel.hlPutSmb30(body: JSONObject): String = api29 { hlPut("/backup/settings", body) }
