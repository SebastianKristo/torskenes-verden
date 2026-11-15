package no.kristo.felles.tid

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * «I dag» er alltid Oslo-datoen (Q20), også mellom 00 og 02 og rundt bytte til og fra sommertid.
 * Fasit: shared/testvektorer/idag.json (OsloDatoTest). Bruk denne i stedet for LocalDate.now() uten sone.
 */
object OsloDato {
    val SONE: ZoneId = ZoneId.of("Europe/Oslo")

    /** Oslo-datoen for [naa] (standard: nå). */
    fun iDag(naa: Instant = Instant.now()): LocalDate = naa.atZone(SONE).toLocalDate()

    /** «YYYY-MM-DD» for [naa] i Oslo. */
    fun iDagTekst(naa: Instant = Instant.now()): String = iDag(naa).toString()

    /** Klokka i Oslo for [naa]. */
    fun klokka(t: Instant = Instant.now()): LocalDateTime = t.atZone(SONE).toLocalDateTime()

    /** Minutter siden midnatt i Oslo. */
    fun minuttIDag(t: Instant = Instant.now()): Int = klokka(t).let { it.hour * 60 + it.minute }
}
