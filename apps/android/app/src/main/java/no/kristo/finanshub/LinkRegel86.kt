package no.kristo.finanshub

/** Prompt 86 (AND86): spørsmålet som vises før en lenke utenfra får utføre en handling. */
data class Ask86(val title: String, val text: String)

/**
 * Hva en finanshub://-lenke gjør når den ENDRER noe (starter Hjemlys, svarer på en innsjekk, legger til varer, slår på sanntid).
 * null = lenken åpner bare en side, og åpnes uten spørsmål. Ren regel uten Android-typer (kjøres mot fasit).
 *
 * [host] og [path] er lenkens vert og sti (uten skråstreker rundt), [q] spørringen, [varer] det act51-lenken ville lagt til.
 */
fun linkAsk86(host: String, path: String, q: Map<String, String?>, varer: List<String> = emptyList()): Ask86? = when (host.lowercase()) {
    "hjemlys" -> when (path) {
        "start" -> Ask86("Vil du starte Hjemlys?", "Familien får beskjed om at du er på vei hjem, og posisjonen din deles til du er framme.")
        "home" -> Ask86("Vil du melde «Jeg er hjemme»?", "Hjemlys avsluttes, og familien får beskjed om at du er hjemme.")
        "ok" -> Ask86("Vil du melde «Alt bra»?", "Familien får beskjed om at alt er bra.")
        else -> null
    }
    "familie", "family" -> if (q["id"].isNullOrBlank()) null else when (q["act"]) {
        "ok" -> Ask86("Vil du svare 👍 på innsjekken?", "Avsenderen får svaret ditt med en gang.")
        "pickup" -> Ask86("Vil du svare at du kommer og henter?", "Avsenderen får beskjed, og posisjonen din sendes med.")
        "call" -> Ask86("Vil du svare «Ringer» på innsjekken?", "Avsenderen får beskjed, og telefonen åpner nummeret.")
        else -> null
    }
    "act51" -> if (path !in setOf("add", "q") || varer.isEmpty()) null else
        Ask86("Vil du legge til ${varer.joinToString(", ") { "«$it»" }} i handlelisten?", "Varene legges til i husstandens handleliste.")
    "kart", "map" -> if (q["live"] == "1" && (path.isNotBlank() || !q["zone"].isNullOrBlank()))
        Ask86("Vil du slå på sanntid i Kart?", "Kjøretøy rundt stedet i lenken vises i sanntid for husstanden.") else null
    else -> null
}
