package no.kristo.felles.nett

/**
 * Serveradressen: normalisering av det brukeren skriver, og om adressen er på lokalt nett.
 *
 * Fasit: shared/testvektorer/serveradresse.json (F-logikk L8, Q39). Det må skje på enheten før appen har kontakt med
 * serveren, så regelen er et av unntakene i CLAUDE.md og testes av ServerAdresseTest mot fila. Samme regel som
 * apps/ios/SharedNet/ServerAddress.swift. Brukes av :app (Api.normalizeServer), :kalender og :wear.
 */
object ServerAdresse {
    /** Standard ekstern adresse. */
    const val STANDARD: String = "https://os.smarthjemeksperten.no"

    /** Den gamle, feilstavede standarden (delt i to, så et søk etter stavemåten bare treffer migreringen). */
    const val GAMMEL_STANDARD: String = "https://os.smarthjem" + "experten.no"

    /** Er [s] nøyaktig den gamle standarden (med eller uten / til slutt og mellomrom, uansett store/små bokstaver)? */
    fun erGammelStandard(s: String?): Boolean = s != null && s.trim().trimEnd('/').equals(GAMMEL_STANDARD, ignoreCase = true)

    /** Gammel standard → ny standard. Andre adresser røres ikke. */
    fun migrer(s: String?): String? = if (erGammelStandard(s)) STANDARD else s

    /** Det brukeren skrev → skjema + vert (+ port), uten sti og uten / til slutt. null når den er tom. */
    fun normaliser(raw: String?): String? {
        var s = (raw ?: "").trim()
        while (s.endsWith("/")) s = s.dropLast(1)
        if (s.isEmpty()) return null
        if (erGammelStandard(s)) return STANDARD
        // Sti fjernes («/finans», «/finans/api»): appen legger selv til stiene.
        val start = s.indexOf("://").let { if (it >= 0) it + 3 else 0 }
        val slash = s.indexOf('/', start)
        if (slash >= 0) s = s.substring(0, slash)
        if (s.isEmpty()) return null
        if (s.startsWith("http://", ignoreCase = true)) return "http://" + s.substring(7)
        if (s.startsWith("https://", ignoreCase = true)) return "https://" + s.substring(8)
        return (if (lokal(vert(s))) "http://" else "https://") + s
    }

    /** Verten i en adresse med eller uten skjema («[::1]:3000» → «::1», «nas.local:3000» → «nas.local»). */
    fun vert(adresse: String): String {
        var s = adresse.trim()
        val i = s.indexOf("://")
        if (i >= 0) s = s.substring(i + 3)
        s = s.substringBefore('/').substringBefore('?').substringBefore('#')
        s = s.substringAfterLast('@')
        if (s.startsWith("[")) {
            val end = s.indexOf(']')
            return (if (end > 0) s.substring(1, end) else s.drop(1)).lowercase()
        }
        // Mer enn ett kolon uten klammer = IPv6 uten port.
        if (s.count { it == ':' } > 1) return s.lowercase()
        return s.substringBefore(':').lowercase()
    }

    /** Lokalt nett (da er http tillatt). Samme regel som [LokaltNett.lokalVert]; slår aldri opp i DNS. */
    fun lokal(vert: String?): Boolean = LokaltNett.lokalVert(vert)

    /** Klartekst (http) bare på lokalt nett. false for tom adresse. */
    fun tillatt(raw: String?): Boolean {
        val n = normaliser(raw) ?: return false
        if (n.startsWith("https://")) return true
        return lokal(vert(n))
    }

    /** Adressen er lokal (brukes til «Lokal»/«Ekstern» i appen). */
    fun erLokalAdresse(raw: String?): Boolean = normaliser(raw)?.let { lokal(vert(it)) } ?: false

    /** «Pålitelig enhet» (docs/sikkerhet.md): bare 10/8, 172.16/12 og 192.168/16 – strengere enn [lokal]. */
    fun paaliteligEnhet(ip: String?): Boolean {
        val p = LokaltNett.v4((ip ?: "").trim()) ?: return false
        return p[0] == 10 || (p[0] == 172 && p[1] in 16..31) || (p[0] == 192 && p[1] == 168)
    }
}
